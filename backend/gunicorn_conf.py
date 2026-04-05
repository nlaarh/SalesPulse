# Gunicorn configuration for production
import multiprocessing

bind = "0.0.0.0:8000"

# 2-4 workers is optimal for async uvicorn workers behind a single process.
# Each uvicorn worker handles thousands of concurrent async requests.
# More workers = more SF rate-limit budget consumed (20 calls/min each).
workers = min(multiprocessing.cpu_count() * 2 + 1, 4)
worker_class = "uvicorn.workers.UvicornWorker"
worker_connections = 1000   # concurrent connections per worker

# Recycle workers periodically to prevent memory leaks
max_requests = 1000
max_requests_jitter = 100

timeout = 120
keepalive = 30
preload_app = True   # load app once before forking — workers share read-only memory

accesslog = "-"
errorlog = "-"
loglevel = "info"
