# The Morning App web container: Python plus pg8000 (the Postgres driver, pure Python).
FROM python:3.12-alpine
RUN pip install --no-cache-dir pg8000==1.31.2
CMD ["python", "-I", "/srv/_kit/serve.py"]
