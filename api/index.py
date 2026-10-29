import os
import sys

# Add project root to Python module path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

# Ensure running in Vercel serverless mode
os.environ['VERCEL'] = '1'

from server import app

# WSGI entry point for Vercel
# Vercel Python runtime detects `app` automatically
