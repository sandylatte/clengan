#!/usr/bin/env python3
"""Dev server for the app shell.

`python3 -m http.server` sends no Cache-Control, so browsers heuristically
cache the ES modules and keep serving a stale rollup.js after an edit. That
looks exactly like a missing export and costs a real debugging detour. Every
response here is no-store, so a reload is always the code on disk.
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Serve the app, not the working directory. Launch configs live at the
        # workspace root and start this with a cwd one level up, which would
        # otherwise serve a directory listing instead of the shell.
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', 8123))
    print(f'http://localhost:{port}')
    ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler).serve_forever()
