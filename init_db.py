import sqlite3
import os

def init_databases():
    """
    필요한 데이터베이스 파일들을 초기화
    """
    try:
        # DB 폴더가 없으면 생성
        if not os.path.exists('DB'):
            os.makedirs('DB')
        
        conn = sqlite3.connect('DB/verify_user.db')
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                phone TEXT,
                DOB TEXT,
                name TEXT,
                telecom TEXT,
                Total_amount INTEGER DEFAULT 0,
                now_amount INTEGER DEFAULT 0
            )
        ''')
        conn.commit()
        conn.close()
        
        conn = sqlite3.connect('DB/admin.db')
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS admins (
                user_id INTEGER PRIMARY KEY,
                username TEXT
            )
        ''')
        conn.commit()
        conn.close()
        
        conn = sqlite3.connect('DB/history.db')
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS transaction_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                amount INTEGER,
                type TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                txid TEXT,
                coin_type TEXT,
                address TEXT,
                fee INTEGER DEFAULT 0
            )
        ''')
        
        # 새로생성없는경우
        try:
            cursor.execute('ALTER TABLE transaction_history ADD COLUMN txid TEXT')
        except:
            pass
        try:
            cursor.execute('ALTER TABLE transaction_history ADD COLUMN coin_type TEXT')
        except:
            pass
        try:
            cursor.execute('ALTER TABLE transaction_history ADD COLUMN address TEXT')
        except:
            pass
        try:
            cursor.execute('ALTER TABLE transaction_history ADD COLUMN fee INTEGER DEFAULT 0')
        except:
            pass
        
        conn.commit()
        conn.close()
        
        print("데이터베이스 초기화 완료!")
        
    except Exception as e:
        print(f"데이터베이스 초기화 오류: {e}")

if __name__ == "__main__":
    init_databases()
