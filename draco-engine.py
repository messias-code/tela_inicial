#!/usr/bin/env python3
"""draco-engine — motor de execução da Draco Workstation.

Serve os arquivos estáticos e expõe a API do Draco Scanner: orquestra um
pipeline de reconhecimento (nmap + ferramentas complementares) e transmite
a saída em tempo real para o painel. Só biblioteca padrão.

    python3 draco-engine.py            # sobe como root (pede a senha do sudo)
    python3 draco-engine.py 8000       # outra porta
    python3 draco-engine.py --no-root  # não elevar (SYN scan cai para -sT)

Por padrão o motor se eleva a root com sudo antes de subir — o nmap precisa
de root para SYN scan (-sS), detecção de SO e traceroute.

Uso autorizado apenas: infraestrutura própria, laboratórios, CTF ou trabalhos
com escopo por escrito. O alvo padrão scanme.nmap.org é liberado pelo projeto nmap.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote


# ------------------------------------------------------------------ elevação
def ensure_root():
    """Reexecuta via sudo se não estivermos como root (a menos que --no-root)."""
    if "--no-root" in sys.argv:
        sys.argv.remove("--no-root")
        return
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        return
    if not shutil.which("sudo"):
        print("! sudo indisponível — seguindo sem root (SYN scan cairá para -sT)")
        return
    print("draco-engine precisa de root para o nmap. Elevando com sudo…")
    os.execvp("sudo", ["sudo", sys.executable, os.path.abspath(__file__), *sys.argv[1:]])


ensure_root()

# ------------------------------------------------------------------ config
ROOT = os.path.dirname(os.path.abspath(__file__))
IS_ROOT = hasattr(os, "geteuid") and os.geteuid() == 0
NMAP = shutil.which("nmap")

TARGET_RE = re.compile(r"^[A-Za-z0-9._:/-]{1,255}$")
IPV4_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")

PROFILES = ("furtivo", "agressivo")
PACES = ("rapido", "lento")

WL = {
    "rapido": "/usr/share/wordlists/dirb/common.txt",
    "lento": "/usr/share/wordlists/dirb/big.txt",
}

RECON_TOOLS = [
    "nmap", "whatweb", "nikto", "wafw00f", "sslscan", "gobuster", "nxc",
    "enum4linux", "dnsrecon", "onesixtyone", "snmp-check", "searchsploit",
    "dig", "host",
]

# portas comumente HTTP / TLS mesmo sem o nmap rotular
HTTP_PORTS = {80, 81, 88, 591, 2080, 3000, 4000, 5000, 7001, 8000, 8008, 8080,
              8081, 8088, 8443, 8888, 9000, 9090, 9200, 9443, 10000}
TLS_PORTS = {443, 465, 563, 636, 853, 989, 990, 992, 993, 995, 5061, 6697,
             8443, 9443, 10443}

_scan_lock = threading.Lock()


def is_ip(t):
    return bool(IPV4_RE.match(t)) or ":" in t


def timing(profile, pace):
    return {
        ("furtivo", "rapido"): "-T3",
        ("furtivo", "lento"): "-T1",
        ("agressivo", "rapido"): "-T4",
        ("agressivo", "lento"): "-T2",
    }[(profile, pace)]


def budget(pace):
    """Tempo máximo por etapa, em segundos."""
    if pace == "rapido":
        return dict(port=600, deep=360, tool=180, nikto=200, gobuster=240,
                    udp=300, vuln=480)
    return dict(port=3600, deep=1200, tool=600, nikto=900, gobuster=900,
                udp=1500, vuln=1500)


# ------------------------------------------------------------------ plano
def plan_steps(profile, pace, target):
    stealth = profile == "furtivo"
    ipt = is_ip(target)
    tmg = timing(profile, pace)
    tspec = ("--top-ports %s" % ("2000" if pace == "lento" else "1000")
             if stealth else "-p- (65535 portas)")
    steps = []

    steps.append(("Resolução e DNS",
                  "PTR reverso do IP" if ipt else
                  ("host + registros" if stealth else
                   "host + registros + dnsrecon (enum padrão e tentativa de AXFR)")))

    steps.append(("Descoberta de host",
                  "-Pn — assume ativo, sem sondas de descoberta" if stealth else
                  "-sn com sondas ICMP echo/timestamp + TCP SYN/ACK"))

    steps.append(("Varredura de portas TCP",
                  "SYN %s %s%s" % (tmg, tspec,
                  " · -f + --scan-delay 200ms" if stealth and pace == "lento" else "")))

    steps.append(("Serviços, versões" + ("" if stealth else ", SO") + " e NSE",
                  "-sV --version-light + scripts seguros (-sC)" if stealth else
                  "-sV --version-all -O -sC --traceroute --script %s" %
                  ("default,discovery" if pace == "rapido" else "default,discovery,vuln")))

    if not stealth:
        steps.append(("Varredura UDP",
                      "--top-ports %s" % ("150" if pace == "lento" else "100")))

    steps.append(("Enumeração por serviço",
                  "HTTP: whatweb -a1 + NSE headers/title (leve) · TLS: ssl-cert"
                  if stealth else
                  "HTTP: whatweb -a3, wafw00f, NSE http-*, nikto, gobuster (%s) · "
                  "TLS: ssl-enum-ciphers, sslscan · SMB: nxc/enum4linux + NSE · "
                  "DNS/SNMP/FTP/SSH/SMTP/RDP/BD: NSE dedicados" %
                  os.path.basename(WL[pace])))

    if not stealth:
        steps.append(("Mapeamento de vulnerabilidades",
                      "nmap --script vulners (CVSS ≥ 5) + searchsploit nos banners"))

    steps.append(("Resumo", "tabela de portas/serviços, contagens e tempo total"))

    return [{"n": i + 1, "title": t, "detail": d} for i, (t, d) in enumerate(steps)]


# ------------------------------------------------------------------ parsing
def parse_ports(text, proto):
    out = set()
    for m in re.finditer(r"Discovered open port (\d+)/%s" % proto, text):
        out.add(int(m.group(1)))
    for m in re.finditer(r"^(\d+)/%s\s+open(?!\|)" % proto, text, re.M):
        out.add(int(m.group(1)))
    return sorted(out)


def parse_services(text):
    """port -> (serviço, produto, versão) a partir da saída -sV do nmap."""
    svc = {}
    for m in re.finditer(r"^(\d+)/tcp +open +(\S+)(?:[ \t]+(\S.*?))? *$", text, re.M):
        port, name, rest = int(m.group(1)), m.group(2), (m.group(3) or "").strip()
        prod, ver = "", ""
        rest = re.sub(r"\s+(syn-ack|ttl \d+).*", "", rest).strip()
        if rest and rest not in ("tcpwrapped",):
            mm = re.match(r"(.+?)\s+(\d[\w.\-]*)", rest)
            if mm:
                prod, ver = mm.group(1).strip(), mm.group(2)
            else:
                prod = rest
        svc[port] = (name, prod, ver)
    return svc


def summary(target, tcp, udp, services, elapsed):
    out = [
        "alvo ............ %s" % target,
        "portas TCP ...... %d aberta(s)" % len(tcp),
        "portas UDP ...... %d aberta(s)/filtrada(s)" % len(udp),
        "tempo total ..... %dm%02ds" % (elapsed // 60, elapsed % 60),
        "",
    ]
    if services:
        out.append("%-9s %-15s %s" % ("PORTA", "SERVIÇO", "PRODUTO / VERSÃO"))
        for p in sorted(services):
            name, prod, ver = services[p]
            pv = ("%s %s" % (prod, ver)).strip() or "-"
            out.append("%-9s %-15s %s" % ("%d/tcp" % p, name, pv))
    for p in sorted(udp):
        out.append("%-9s %-15s %s" % ("%d/udp" % p, "-", "-"))
    out += ["", "revise os blocos acima para achados de configuração, "
            "exposição de serviços e CVEs."]
    return "\n".join(out) + "\n"


# ------------------------------------------------------------------ HTTP
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "draco-engine"

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s - %s\n" % (self.address_string(), fmt % args))

    # ------------------------------------------------------------ GET
    def do_GET(self):
        path = self.path.split("?", 1)[0]

        if path == "/api/health":
            return self._json(200, {
                "ok": True,
                "nmap": bool(NMAP),
                "root": IS_ROOT,
                "tools": {t: bool(shutil.which(t)) for t in RECON_TOOLS},
            })

        if path == "/api/plan":
            q = parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
            profile = q.get("profile", ["furtivo"])[0]
            pace = q.get("pace", ["rapido"])[0]
            target = unquote(q.get("target", ["scanme.nmap.org"])[0])
            if profile not in PROFILES or pace not in PACES or not TARGET_RE.match(target):
                return self._json(400, {"error": "parâmetros inválidos"})
            return self._json(200, {"steps": plan_steps(profile, pace, target),
                                    "root": IS_ROOT})

        return self._serve_static(path)

    # ------------------------------------------------------------ POST
    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/scan":
            return self._json(404, {"error": "rota desconhecida"})

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"error": "JSON inválido"})

        parts = str(body.get("target", "")).strip().split()
        target = parts[0] if parts else ""
        profile = str(body.get("profile", "")).strip()
        pace = str(body.get("pace", "")).strip()
        if not (profile and pace):
            mode = str(body.get("mode", "furtivo-rapido"))
            profile, _, pace = mode.partition("-")

        if not TARGET_RE.match(target):
            return self._json(400, {"error": "alvo inválido"})
        if profile not in PROFILES or pace not in PACES:
            return self._json(400, {"error": "perfil/ritmo inválido"})
        if not NMAP:
            return self._json(503, {"error": "nmap não encontrado. Instale: apt install nmap"})

        if not _scan_lock.acquire(blocking=False):
            return self._json(429, {"error": "já há uma varredura em andamento"})
        try:
            self._run_pipeline(target, profile, pace)
        finally:
            _scan_lock.release()

    # ------------------------------------------------------------ pipeline
    def _run_pipeline(self, target, profile, pace):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()

        self._proc = None
        self._n = 0
        b = budget(pace)
        stealth = profile == "furtivo"
        tmg = timing(profile, pace)
        syn = "-sS" if IS_ROOT else "-sT"
        host = target
        start = time.time()

        def emit(s):
            self.wfile.write(s.encode("utf-8", "replace"))
            self.wfile.flush()

        def head(title, note=None):
            self._n += 1
            bar = "═" * max(6, 56 - len(title))
            emit("\n═══ %d · %s %s\n" % (self._n, title, bar))
            if note:
                emit(note + "\n")

        def run(cmd, timeout):
            exe = shutil.which(cmd[0])
            if not exe:
                emit("$ %s\n(pulado — %s não instalado)\n" % (" ".join(cmd), cmd[0]))
                return ""
            argv = [exe, *cmd[1:]]
            emit("$ %s\n" % " ".join(argv))
            try:
                proc = subprocess.Popen(argv, stdout=subprocess.PIPE,
                                        stderr=subprocess.STDOUT, text=True,
                                        bufsize=1, errors="replace")
            except OSError as e:
                emit("(erro ao iniciar: %s)\n" % e)
                return ""
            self._proc = proc
            timed = {"hit": False}
            tmr = threading.Timer(
                timeout, lambda: (timed.__setitem__("hit", True), proc.kill()))
            tmr.start()
            out = []
            try:
                for line in proc.stdout:
                    out.append(line)
                    emit(line)
            except (BrokenPipeError, ConnectionResetError):
                proc.kill()
                tmr.cancel()
                raise
            finally:
                tmr.cancel()
            proc.wait()
            self._proc = None
            if timed["hit"]:
                emit("\n[etapa passou de %ds — interrompida]\n" % timeout)
            elif proc.returncode not in (0, None):
                emit("[%s: código %d]\n" % (cmd[0], proc.returncode))
            return "".join(out)

        try:
            emit("Draco Scanner · %s · perfil %s · ritmo %s\n"
                 % (target, profile, pace))
            emit("início %s\n" % time.strftime("%H:%M:%S"))
            if not IS_ROOT:
                emit("! sem root: SYN scan (-sS) → connect scan (-sT); sem -O\n")

            # 1 · DNS ---------------------------------------------------------
            head("Resolução e DNS")
            if is_ip(target):
                run(["dig", "+noall", "+answer", "-x", target], b["tool"])
            else:
                run(["host", target], b["tool"])
                if not stealth:
                    run(["dnsrecon", "-d", target, "-t", "std"], b["tool"])
                    run(["dnsrecon", "-d", target, "-t", "axfr"], b["tool"])

            # 2 · descoberta ------------------------------------------------
            head("Descoberta de host")
            if stealth:
                emit("-Pn — sem sondas de descoberta (assume ativo)\n")
            else:
                run(["nmap", "-sn", "-PE", "-PP",
                     "-PS21,22,25,80,443,3389,8080", "-PA80,443", tmg,
                     "-oN", "-", target], b["tool"])

            # 3 · portas TCP ----------------------------------------------
            head("Varredura de portas TCP")
            p = ["nmap", syn, "-Pn", "-v", tmg, "--open", "--stats-every", "15s"]
            if stealth:
                p += ["--top-ports", "2000" if pace == "lento" else "1000",
                      "--max-retries", "2", "--data-length", "24"]
                if pace == "lento":
                    p += ["-f", "--scan-delay", "200ms"]
            else:
                p += ["-p-"]
                p += ["--min-rate", "1200"] if pace == "rapido" else ["--max-retries", "4"]
            p += [target]
            tcp = parse_ports(run(p, b["port"]), "tcp")
            emit("\n> portas TCP abertas: %s\n"
                 % (", ".join(map(str, tcp)) if tcp else "nenhuma"))

            # 4 · serviços / versões / SO / NSE --------------------------
            services = {}
            if tcp:
                plist = ",".join(map(str, tcp))
                head("Serviços, versões" + ("" if stealth else ", SO") + " e NSE")
                p = ["nmap", syn, "-Pn", tmg, "-sV", "-p", plist]
                if stealth:
                    p += ["--version-light", "-sC"]
                else:
                    p += ["--version-all", "-sC", "--traceroute", "--script-timeout",
                          "120s", "--script",
                          "default,discovery" if pace == "rapido"
                          else "default,discovery,vuln"]
                    if IS_ROOT:
                        p += ["-O"]
                p += [target]
                services = parse_services(run(p, b["deep"]))

            # 5 · UDP (agressivo) ---------------------------------------
            udp = []
            if not stealth:
                head("Varredura UDP")
                p = ["nmap", "-sU", "-Pn", "-v", "--open",
                     "-T3" if pace == "lento" else "-T4",
                     "--top-ports", "150" if pace == "lento" else "100", target]
                udp = parse_ports(run(p, b["udp"]), "udp")
                emit("\n> portas UDP abertas/filtradas: %s\n"
                     % (", ".join(map(str, udp)) if udp else "nenhuma"))

            # 6 · enumeração por serviço --------------------------------
            head("Enumeração por serviço")
            if services or udp:
                self._enum(run, emit, target, host, stealth, tmg, pace, b,
                           services, set(udp))
            else:
                emit("(sem serviços para enumerar)\n")

            # 7 · vulnerabilidades (agressivo) ------------------------
            if not stealth and tcp:
                head("Mapeamento de vulnerabilidades")
                plist = ",".join(map(str, tcp))
                run(["nmap", "-sV", "-Pn", tmg, "-p", plist, "--script", "vulners",
                     "--script-args", "mincvss=5.0", target], b["vuln"])
                seen = set()
                for port in sorted(services):
                    _, prod, ver = services[port]
                    if prod and prod.lower() not in seen:
                        seen.add(prod.lower())
                        run(["searchsploit", "--disable-colour",
                             *(prod.split() + ([ver] if ver else []))], b["tool"])
                    if len(seen) >= 6:
                        break

            # 8 · resumo ----------------------------------------------
            head("Resumo")
            emit(summary(target, tcp, udp, services, int(time.time() - start)))
            emit("\nfim %s\n" % time.strftime("%H:%M:%S"))

        except (BrokenPipeError, ConnectionResetError):
            p = getattr(self, "_proc", None)
            if p and p.poll() is None:
                p.kill()
        except Exception as e:  # pragma: no cover - defensivo
            try:
                emit("\n[erro no pipeline: %s]\n" % e)
            except OSError:
                pass

    # ------------------------------------------------------------ enum
    def _enum(self, run, emit, target, host, stealth, tmg, pace, b, services, udp):
        def nse(port, scripts, timeout=None):
            run(["nmap", "-Pn", tmg, "-p", str(port), "--script", scripts, host],
                timeout or b["tool"])

        open_tcp = set(services)
        http = [p for p in open_tcp
                if p in HTTP_PORTS or "http" in services[p][0]]
        tls = [p for p in open_tcp
               if p in TLS_PORTS or "https" in services[p][0] or "ssl" in services[p][0]]

        for port in sorted(set(http))[:5]:
            name = services.get(port, ("",))[0]
            scheme = "https" if (port in TLS_PORTS or "https" in name or "ssl" in name) else "http"
            url = "%s://%s:%d/" % (scheme, host, port)
            emit("\n— HTTP %s\n" % url)
            run(["whatweb", "--colour=never", "--no-errors",
                 "-a", "1" if stealth else "3", url], b["tool"])
            if stealth:
                nse(port, "http-headers,http-title,http-methods")
                continue
            run(["wafw00f", "-a", url], b["tool"])
            nse(port, "http-enum,http-headers,http-methods,http-title,"
                      "http-robots.txt,http-security-headers,http-cookie-flags,"
                      "http-git,http-webdav-scan,http-shellshock,"
                      "http-vuln-cve2017-5638,http-vuln-cve2015-1635", b["deep"])
            run(["nikto", "-host", url, "-maxtime", "%ds" % b["nikto"],
                 "-nointeractive", "-ask", "no"], b["nikto"] + 30)
            wl = WL.get(pace, "")
            if wl and os.path.isfile(wl):
                run(["gobuster", "dir", "-u", url, "-w", wl, "-q", "-t", "30",
                     "-k", "--no-error", "--timeout", "10s"], b["gobuster"])

        for port in sorted(set(tls))[:5]:
            emit("\n— TLS :%d\n" % port)
            nse(port, "ssl-cert" if stealth
                else "ssl-cert,ssl-enum-ciphers,ssl-dh-params,tls-alpn,tls-nextprotoneg",
                b["deep"] if not stealth else b["tool"])
            if not stealth:
                run(["sslscan", "--no-colour", "%s:%d" % (host, port)], b["tool"])

        if open_tcp & {139, 445}:
            emit("\n— SMB 139/445\n")
            scr = ("smb-protocols,smb-security-mode,smb2-security-mode,"
                   "smb-os-discovery,smb2-time")
            if not stealth:
                scr += (",smb-enum-shares,smb-enum-users,smb-enum-domains,"
                        "smb-enum-sessions,smb-mbenum,smb-vuln-ms17-010,"
                        "smb-double-pulsar-backdoor")
            run(["nmap", "-Pn", tmg, "-p", "139,445", "--script", scr, host],
                b["deep"])
            if not stealth:
                run(["nxc", "smb", host, "-u", "", "-p", "", "--shares"], b["tool"])
                run(["enum4linux", "-A", host], b["deep"])

        if 53 in open_tcp or 53 in udp:
            emit("\n— DNS 53\n")
            run(["nmap", "-Pn", tmg, "-sU", "-sT", "-p", "53", "--script",
                 "dns-nsid,dns-recursion" + ("" if stealth else ",dns-cache-snoop"),
                 host], b["tool"])

        if 161 in udp:
            emit("\n— SNMP 161/udp\n")
            run(["onesixtyone", host], b["tool"])
            if not stealth:
                run(["snmp-check", host], b["tool"])

        if 21 in open_tcp:
            emit("\n— FTP 21\n")
            nse(21, "ftp-anon,ftp-syst" + ("" if stealth
                else ",ftp-bounce,ftp-vsftpd-backdoor,ftp-proftpd-backdoor"))

        if 22 in open_tcp:
            emit("\n— SSH 22\n")
            nse(22, "ssh2-enum-algos,ssh-hostkey"
                + ("" if stealth else ",ssh-auth-methods"))

        smtp = sorted(open_tcp & {25, 465, 587})
        if smtp:
            emit("\n— SMTP %s\n" % ",".join(map(str, smtp)))
            run(["nmap", "-Pn", tmg, "-p", ",".join(map(str, smtp)), "--script",
                 "smtp-commands,smtp-ntlm-info" + ("" if stealth
                 else ",smtp-open-relay,smtp-enum-users"), host], b["tool"])

        if 3389 in open_tcp:
            emit("\n— RDP 3389\n")
            nse(3389, "rdp-ntlm-info,rdp-enum-encryption"
                + ("" if stealth else ",rdp-vuln-ms12-020"))

        if not stealth:
            dbmap = {
                3306: "mysql-info,mysql-empty-password,mysql-users",
                1433: "ms-sql-info,ms-sql-ntlm-info,ms-sql-empty-password",
                6379: "redis-info",
                27017: "mongodb-info,mongodb-databases",
                5900: "vnc-info,realvnc-auth-bypass",
                11211: "memcached-info",
            }
            for port, scr in dbmap.items():
                if port in open_tcp:
                    emit("\n— serviço :%d\n" % port)
                    nse(port, scr)

    # ------------------------------------------------------------ static
    def _serve_static(self, path):
        rel = path.lstrip("/") or "index.html"
        full = os.path.normpath(os.path.join(ROOT, rel))
        if not full.startswith(ROOT) or not os.path.isfile(full):
            return self._json(404, {"error": "não encontrado"})

        ctype = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
        }.get(os.path.splitext(full)[1], "application/octet-stream")

        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    # ------------------------------------------------------------ util
    def _json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("draco-engine  http://localhost:%d" % port)
    print("  nmap:  %s" % (NMAP or "NÃO ENCONTRADO — apt install nmap"))
    print("  root:  %s" % IS_ROOT)
    missing = [t for t in RECON_TOOLS if not shutil.which(t)]
    if missing:
        print("  sem:   %s" % ", ".join(missing))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nencerrando")
        httpd.shutdown()


if __name__ == "__main__":
    main()
