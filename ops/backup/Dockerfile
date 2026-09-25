# The nightly backup job (backup.sh). pg_dump must be at least the server's
# version; the system is developed and run on PostgreSQL 18.
FROM postgres:18-alpine
RUN apk add --no-cache bash curl age
COPY backup.sh recipients.txt /backup/
ENTRYPOINT ["/backup/backup.sh"]
CMD []
