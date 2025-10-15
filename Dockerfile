# 使用輕量化 Python 環境
FROM python:3.10-slim

# 設定工作目錄
WORKDIR /app

# 複製需求套件並安裝
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製應用程式
COPY . .

# 若你用 FastAPI + Uvicorn
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
