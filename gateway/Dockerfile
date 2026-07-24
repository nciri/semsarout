FROM python:3.12-slim

WORKDIR /app

# Libs partagées (monorepo) puis le gateway.
COPY libs/semsar_common /libs/semsar_common
RUN pip install --no-cache-dir /libs/semsar_common

COPY gateway/pyproject.toml /app/pyproject.toml
COPY gateway/app /app/app
RUN pip install --no-cache-dir .

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
