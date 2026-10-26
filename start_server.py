#!/usr/bin/env python3
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get('PORT', '8000'))

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

print(f'Serving {ROOT} on http://localhost:{PORT}')
server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
try:
    server.serve_forever()
except KeyboardInterrupt:
    print('\nStopping server...')
finally:
    server.server_close()
