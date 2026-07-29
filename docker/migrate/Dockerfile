# One-shot migration runner. Just needs a psql client matching the server.
FROM postgres:17-alpine
COPY docker/migrate/migrate.sh /usr/local/bin/migrate.sh
RUN chmod +x /usr/local/bin/migrate.sh
ENTRYPOINT ["/usr/local/bin/migrate.sh"]
