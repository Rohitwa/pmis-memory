# Divisha Wellness, for fly.io. Build context: this folder (divisha/).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY app app
COPY server server

# The diary lives on a Fly volume mounted at /data.
ENV DATA_DIR=/data APP_DIR=/srv/app COOKIE_SECURE=1
EXPOSE 8080

# One process only: the diary is one SQLite file and live updates are in memory.
CMD ["python", "-m", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8080", \
     "--proxy-headers", "--forwarded-allow-ips", "*", "--timeout-keep-alive", "75", "--workers", "1"]
