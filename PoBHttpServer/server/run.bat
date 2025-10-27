@echo off
setlocal
cd /d %~dp0
if not exist .venv (
  py -3 -m venv .venv
  call .venv\Scripts\activate
  python -m pip install --upgrade pip
  pip install -r requirements.txt
) else (
  call .venv\Scripts\activate
)
uvicorn app:app --host 127.0.0.1 --port 5000 --reload
