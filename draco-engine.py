#!/usr/bin/env python3
"""draco-engine — motor de execução da Draco Workstation.

Serve os arquivos estáticos e expõe /api/scan, que roda o nmap e transmite
a saída em tempo real para o painel. Só biblioteca padrão.

    python3 draco-engine.py            # sobe como root (pede a senha do sudo)
    python3 draco-engine.py 8000       # outra porta
    python3 draco-engine.py --no-root  # não elevar (modos furtivos caem p/ -sT)

Por padrão o motor se eleva a root com sudo antes de subir — o nmap precisa de
root para SYN scan (-sS), OS detection e traceroute dos modos agressivos.

Uso autorizado apenas: infraestrutura própria, laboratórios, CTF ou trabalhos
com escopo por escrito. O alvo padrão scanme.nmap.org é liberado pelo projeto nmap.
"""

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


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

ROOT = os.path.dirname(os.path.abspath(__file__))
IS_ROOT = hasattr(os, "geteuid") and os.geteuid() == 0
NMAP = shutil.which("nmap")

MODES = {
    "furtivo-rapido": ["-sS", "-Pn", "-T3"],
    "furtivo-lento": ["-sS", "-Pn", "-T1"],
    "agressivo-rapido": ["-A", "-T4"],
    "agressivo-lento": ["-A", "-T2"],
}

# domínio, IPv4/IPv6, faixa CIDR — sem espaços nem metacaracteres de shell
TARGET_RE = re.compile(r"^[A-Za-z0-9._:/-]{1,255}$")

# uma varredura por vez
_scan_lock = threading.Lock()


def resolve_flags(mode):
    """Devolve (flags, aviso). Sem root, -sS vira -sT (connect scan)."""
    flags = list(MODES.get(mode, MODES["furtivo-rapido"]))
    warning = None
    if "-sS" in flags and not IS_ROOT:
        flags = ["-sT" if f == "-sS" else f for f in flags]
        warning = (
            "Sem privilégios de root: SYN scan (-sS) substituído por connect "
            "scan (-sT). Rode com 'sudo python3 draco-engine.py' para SYN scan."
        )
    return flags, warning


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "draco-engine"

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s - %s\n" % (self.address_string(), fmt % args))

    # ---------------------------------------------------------------- GET
    def do_GET(self):
        path = self.path.split("?", 1)[0]

        if path == "/api/health":
            return self._json(
                200,
                {
                    "ok": True,
                    "nmap": bool(NMAP),
                    "nmap_path": NMAP,
                    "root": IS_ROOT,
                },
            )

        return self._serve_static(path)

    # --------------------------------------------------------------- POST
    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/scan":
            return self._json(404, {"error": "rota desconhecida"})

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"error": "JSON inválido"})

        target = str(body.get("target", "")).strip().split()[:1]
        target = target[0] if target else ""
        mode = str(body.get("mode", "furtivo-rapido"))

        if not TARGET_RE.match(target):
            return self._json(400, {"error": "alvo inválido"})
        if mode not in MODES:
            return self._json(400, {"error": "modo inválido"})
        if not NMAP:
            return self._json(
                503,
                {"error": "nmap não encontrado no PATH. Instale: sudo apt install nmap"},
            )

        if not _scan_lock.acquire(blocking=False):
            return self._json(429, {"error": "já há uma varredura em andamento"})
        try:
            self._stream_scan(target, mode)
        finally:
            _scan_lock.release()

    # ------------------------------------------------------------ stream
    def _stream_scan(self, target, mode):
        flags, warning = resolve_flags(mode)
        argv = [NMAP, *flags, "--stats-every", "5s", target]

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()

        def emit(text):
            try:
                self.wfile.write(text.encode("utf-8", "replace"))
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                raise

        if warning:
            emit("! %s\n\n" % warning)
        emit("$ %s\n\n" % " ".join(argv))

        proc = subprocess.Popen(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            text=True,
        )
        try:
            for line in proc.stdout:
                emit(line)
            proc.wait()
            emit("\n[processo encerrado — código %d]\n" % proc.returncode)
        except (BrokenPipeError, ConnectionResetError):
            proc.send_signal(signal.SIGINT)
            proc.wait(timeout=5)
        finally:
            if proc.poll() is None:
                proc.kill()

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

    # -------------------------------------------------------------- util
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
    print("  nmap:  %s" % (NMAP or "NÃO ENCONTRADO — sudo apt install nmap"))
    print("  root:  %s%s" % (IS_ROOT, "" if IS_ROOT else "  (modos furtivos usarão -sT)"))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nencerrando")
        httpd.shutdown()


if __name__ == "__main__":
    main()
