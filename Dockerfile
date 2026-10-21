FROM mcr.microsoft.com/playwright:v1.49.1-jammy

RUN apt-get update \
 && apt-get install -y --no-install-recommends xvfb x11vnc \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

WORKDIR /app
COPY package.json ./
# Browsers are already in the base image; skip the download step.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY jobs.example.json ./
RUN chmod +x /usr/local/bin/entrypoint.sh \
 && mkdir -p /app/profiles /app/out \
 && chown -R pwuser:pwuser /app

USER pwuser
ENV DISPLAY=:99 PROFILE_DIR=/app/profiles OUT_DIR=/app/out
EXPOSE 5900
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["sleep", "infinity"]
