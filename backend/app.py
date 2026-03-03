"""
百家乐游戏后端 - Flask + SQLite
支持功能：
1. 用户管理（注册/登录）
2. 百家乐游戏逻辑
3. 多人模式
4. 30秒倒计时
"""
import random
import sqlite3
import time
from flask import Flask, jsonify, request, session
from flask_cors import CORS

app = Flask(__name__)
app.secret_key = 'baccarat_secret_key_2024'
CORS(app, supports_credentials=True)

# 数据库配置
DB_PATH = '/root/.openclaw/workspace/baccarat/backend/baccarat.db'

# 游戏倒计时（秒）
GAME_COUNTDOWN = 30


def init_db():
    """初始化数据库"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 创建用户表（增强版）
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            balance INTEGER DEFAULT 1000,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 创建游戏记录表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS game_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            bet_type TEXT NOT NULL,
            bet_amount INTEGER NOT NULL,
            result TEXT NOT NULL,
            win_amount INTEGER NOT NULL,
            player_cards TEXT,
            banker_cards TEXT,
            player_score INTEGER,
            banker_score INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    
    # 创建在线用户表（用于多人模式）
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS online_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_id TEXT NOT NULL,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    
    conn.commit()
    conn.close()


def get_db_connection():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ==================== 用户管理 API ====================

@app.route('/api/register', methods=['POST'])
def register():
    """用户注册"""
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400
    
    if len(username) < 3 or len(password) < 6:
        return jsonify({'error': '用户名至少3位，密码至少6位'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('INSERT INTO users (username, password, balance) VALUES (?, ?, 1000)', 
                      (username, password))
        conn.commit()
        
        cursor.execute('SELECT id, username, balance FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()
        
        conn.close()
        
        return jsonify({
            'message': '注册成功',
            'user': {
                'id': user['id'],
                'username': user['username'],
                'balance': user['balance']
            }
        })
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': '用户名已存在'}), 400


@app.route('/api/login', methods=['POST'])
def login():
    """用户登录"""
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT id, username, password, balance FROM users WHERE username = ?', 
                   (username,))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'error': '用户不存在'}), 404
    
    if user['password'] != password:
        conn.close()
        return jsonify({'error': '密码错误'}), 401
    
    # 生成简单的session token
    session_token = f"{user['id']}_{int(time.time())}"
    
    # 更新在线状态
    cursor.execute('INSERT INTO online_users (user_id, session_id) VALUES (?, ?)',
                   (user['id'], session_token))
    conn.commit()
    
    conn.close()
    
    return jsonify({
        'message': '登录成功',
        'user': {
            'id': user['id'],
            'username': user['username'],
            'balance': user['balance']
        },
        'session_token': session_token
    })


@app.route('/api/logout', methods=['POST'])
def logout():
    """用户登出"""
    data = request.get_json()
    session_token = data.get('session_token')
    
    if not session_token:
        return jsonify({'error': '缺少session_token'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM online_users WHERE session_id = ?', (session_token,))
    conn.commit()
    conn.close()
    
    return jsonify({'message': '登出成功'})


@app.route('/api/user/info', methods=['GET'])
def get_user_info():
    """获取用户信息"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({'error': '缺少user_id参数'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT id, username, balance FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    
    return jsonify({
        'user': {
            'id': user['id'],
            'username': user['username'],
            'balance': user['balance']
        }
    })


# ==================== 百家乐游戏逻辑 ====================

class BaccaratGame:
    """百家乐游戏类"""
    
    def __init__(self):
        self.deck = self.create_deck()
    
    def create_deck(self):
        """创建一副牌"""
        suits = ['♠', '♥', '♦', '♣']
        ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
        deck = []
        for suit in suits:
            for rank in ranks:
                deck.append({'suit': suit, 'rank': rank})
        random.shuffle(deck)
        return deck
    
    def draw_card(self):
        """抽一张牌"""
        if len(self.deck) < 6:
            self.deck = self.create_deck()
        return self.deck.pop()
    
    def get_card_value(self, card):
        """获取牌的点数"""
        rank = card['rank']
        if rank in ['J', 'Q', 'K', '10']:
            return 0
        elif rank == 'A':
            return 1
        else:
            return int(rank)
    
    def calculate_score(self, cards):
        """计算手牌点数（只取个位）"""
        total = sum(self.get_card_value(card) for card in cards)
        return total % 10
    
    def get_banker_action(self, banker_score, player_third_card=None):
        """庄家补牌规则（标准百家乐规则）"""
        if banker_score <= 2:
            return 'draw'
        elif banker_score == 3:
            if player_third_card is None or self.get_card_value(player_third_card) != 8:
                return 'draw'
            return 'stand'
        elif banker_score == 4:
            if player_third_card is None:
                return 'draw'
            val = self.get_card_value(player_third_card)
            if val in [0, 1, 8, 9]:
                return 'stand'
            return 'draw'
        elif banker_score == 5:
            if player_third_card is None:
                return 'draw'
            val = self.get_card_value(player_third_card)
            if val in [0, 1, 2, 3, 8, 9]:
                return 'stand'
            return 'draw'
        elif banker_score == 6:
            if player_third_card is None:
                return 'stand'
            val = self.get_card_value(player_third_card)
            if val in [6, 7]:
                return 'draw'
            return 'stand'
        else:  # 7, 8, 9
            return 'stand'
    
    def deal(self):
        """发牌并返回结果"""
        player_cards = [self.draw_card(), self.draw_card()]
        banker_cards = [self.draw_card(), self.draw_card()]
        
        player_score = self.calculate_score(player_cards)
        banker_score = self.calculate_score(banker_cards)
        
        player_third_card = None
        banker_third_card = None
        
        # 闲家补牌规则（玩家0-5点补牌，6-9点不补）
        if player_score <= 5:
            player_third_card = self.draw_card()
            player_cards.append(player_third_card)
            player_score = self.calculate_score(player_cards)
        
        # 庄家补牌规则
        banker_action = self.get_banker_action(banker_score, player_third_card)
        if banker_action == 'draw':
            banker_third_card = self.draw_card()
            banker_cards.append(banker_third_card)
            banker_score = self.calculate_score(banker_cards)
        
        # 判断胜负
        if player_score > banker_score:
            result = 'player'
        elif banker_score > player_score:
            result = 'banker'
        else:
            result = 'tie'
        
        return {
            'player_cards': player_cards,
            'banker_cards': banker_cards,
            'player_score': player_score,
            'banker_score': banker_score,
            'result': result,
            'player_card_count': len(player_cards),  # 调试用：记录牌数
            'banker_card_count': len(banker_cards)   # 调试用：记录牌数
        }
    
    def format_cards(self, cards):
        """格式化牌面显示"""
        return [f"{card['rank']}{card['suit']}" for card in cards]


# ==================== 游戏状态管理 ====================

# 游戏状态
game_status = {
    'countdown': GAME_COUNTDOWN,
    'last_update': time.time(),
    'current_round': 0,
    'is_betting_open': True
}


@app.route('/api/game/status', methods=['GET'])
def get_game_status_v2():
    """获取游戏状态（含倒计时）"""
    current_time = time.time()
    elapsed = current_time - game_status['last_update']
    
    # 更新倒计时
    remaining = max(0, game_status['countdown'] - int(elapsed))
    
    # 每轮结束重置倒计时
    if remaining == 0 and game_status['is_betting_open']:
        game_status['is_betting_open'] = False
    elif remaining == 0 and not game_status['is_betting_open']:
        # 新一轮开始
        game_status['last_update'] = current_time
        game_status['current_round'] += 1
        game_status['is_betting_open'] = True
    
    return jsonify({
        'countdown': remaining,
        'is_betting_open': game_status['is_betting_open'],
        'current_round': game_status['current_round']
    })


# ==================== 游戏 API ====================

@app.route('/api/init', methods=['POST'])
def init_user():
    """初始化用户（兼容旧版）"""
    data = request.get_json()
    username = data.get('username', 'guest')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 查找或创建用户
    cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
    user = cursor.fetchone()
    
    if not user:
        cursor.execute('INSERT INTO users (username, password, balance) VALUES (?, ?, 1000)', 
                       (username, 'default'))
        conn.commit()
        cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()
    
    conn.close()
    
    return jsonify({
        'user_id': user['id'],
        'username': user['username'],
        'balance': user['balance']
    })


@app.route('/api/bet', methods=['POST'])
def place_bet():
    """下注接口"""
    data = request.get_json()
    user_id = data.get('user_id')
    bet_type = data.get('bet_type')  # 'banker', 'player', 'tie'
    bet_amount = data.get('bet_amount')
    
    # 检查游戏是否可下注
    if not game_status['is_betting_open']:
        return jsonify({'error': '当前禁止下注，请等待下一轮'}), 400
    
    if not all([user_id, bet_type, bet_amount]):
        return jsonify({'error': '缺少必要参数'}), 400
    
    if bet_type not in ['banker', 'player', 'tie']:
        return jsonify({'error': '无效的下注类型'}), 400
    
    if bet_amount not in [10, 50, 100, 500]:
        return jsonify({'error': '无效的下注金额'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 检查用户余额
    cursor.execute('SELECT balance FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'error': '用户不存在'}), 404
    
    balance = user['balance']
    if balance < bet_amount:
        conn.close()
        return jsonify({'error': '余额不足'}), 400
    
    # 扣除下注金额
    new_balance = balance - bet_amount
    cursor.execute('UPDATE users SET balance = ? WHERE id = ?', (new_balance, user_id))
    conn.commit()
    
    # 保存下注记录
    cursor.execute('''
        INSERT INTO game_history (user_id, bet_type, bet_amount, result, win_amount)
        VALUES (?, ?, ?, ?, ?)
    ''', (user_id, bet_type, bet_amount, 'pending', 0))
    
    game_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return jsonify({
        'game_id': game_id,
        'bet_type': bet_type,
        'bet_amount': bet_amount,
        'balance': new_balance,
        'message': '下注成功'
    })


@app.route('/api/deal', methods=['POST'])
def deal_cards():
    """发牌接口"""
    data = request.get_json()
    game_id = data.get('game_id')
    user_id = data.get('user_id')
    
    if not game_id or not user_id:
        return jsonify({'error': '缺少必要参数'}), 400
    
    # 关闭下注
    game_status['is_betting_open'] = False
    game_status['last_update'] = time.time()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 获取下注记录
    cursor.execute('''
        SELECT * FROM game_history WHERE id = ? AND user_id = ?
    ''', (game_id, user_id))
    bet_record = cursor.fetchone()
    
    if not bet_record:
        conn.close()
        return jsonify({'error': '下注记录不存在'}), 404
    
    if bet_record['result'] != 'pending':
        conn.close()
        return jsonify({'error': '该局游戏已结束'}), 400
    
    # 发牌
    game = BaccaratGame()
    result = game.deal()
    
    # 计算赔率
    bet_type = bet_record['bet_type']
    bet_amount = bet_record['bet_amount']
    win_amount = 0
    
    if result['result'] == bet_type:
        if bet_type == 'banker':
            win_amount = int(bet_amount * 0.95)  # 庄家赢抽水5%
        elif bet_type == 'player':
            win_amount = bet_amount
        elif bet_type == 'tie':
            win_amount = bet_amount * 8
    
    # 更新用户余额
    if win_amount > 0:
        cursor.execute('''
            UPDATE users SET balance = balance + ? WHERE id = ?
        ''', (win_amount, user_id))
    
    # 更新游戏记录
    cursor.execute('''
        UPDATE game_history 
        SET result = ?, win_amount = ?,
            player_cards = ?, banker_cards = ?,
            player_score = ?, banker_score = ?
        WHERE id = ?
    ''', (
        result['result'], win_amount,
        ','.join(game.format_cards(result['player_cards'])),
        ','.join(game.format_cards(result['banker_cards'])),
        result['player_score'],
        result['banker_score'],
        game_id
    ))
    conn.commit()
    
    # 获取更新后的余额
    cursor.execute('SELECT balance FROM users WHERE id = ?', (user_id,))
    new_balance = cursor.fetchone()['balance']
    
    conn.close()
    
    return jsonify({
        'result': result['result'],
        'player_cards': game.format_cards(result['player_cards']),
        'banker_cards': game.format_cards(result['banker_cards']),
        'player_score': result['player_score'],
        'banker_score': result['banker_score'],
        'player_card_count': result['player_card_count'],
        'banker_card_count': result['banker_card_count'],
        'bet_type': bet_type,
        'bet_amount': bet_amount,
        'win_amount': win_amount,
        'new_balance': new_balance
    })


@app.route('/api/game', methods=['GET'])
def get_game_info():
    """获取游戏信息（兼容旧版）"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({'error': '缺少user_id参数'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 获取用户信息
    cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'error': '用户不存在'}), 404
    
    # 获取最近游戏记录
    cursor.execute('''
        SELECT * FROM game_history 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 20
    ''', (user_id,))
    
    history = []
    banker_count = 0
    player_count = 0
    tie_count = 0
    
    for row in cursor.fetchall():
        if row['result'] != 'pending':
            history.append({
                'id': row['id'],
                'result': row['result'],
                'bet_type': row['bet_type'],
                'bet_amount': row['bet_amount'],
                'win_amount': row['win_amount'],
                'player_cards': row['player_cards'],
                'banker_cards': row['banker_cards'],
                'player_score': row['player_score'],
                'banker_score': row['banker_score'],
                'created_at': row['created_at']
            })
            
            if row['result'] == 'banker':
                banker_count += 1
            elif row['result'] == 'player':
                player_count += 1
            elif row['result'] == 'tie':
                tie_count += 1
    
    conn.close()
    
    return jsonify({
        'user': {
            'id': user['id'],
            'username': user['username'],
            'balance': user['balance']
        },
        'history': history,
        'stats': {
            'banker': banker_count,
            'player': player_count,
            'tie': tie_count
        }
    })


@app.route('/api/balance', methods=['GET'])
def get_balance():
    """获取用户余额"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({'error': '缺少user_id参数'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT balance FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    
    return jsonify({'balance': user['balance']})


# ==================== 多人模式 API ====================

@app.route('/api/online/users', methods=['GET'])
def get_online_users():
    """获取在线用户列表"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT DISTINCT u.id, u.username, u.balance, o.last_active
        FROM online_users o
        JOIN users u ON o.user_id = u.id
        ORDER BY o.last_active DESC
        LIMIT 10
    ''')
    
    users = []
    for row in cursor.fetchall():
        users.append({
            'id': row['id'],
            'username': row['username'],
            'balance': row['balance'],
            'last_active': row['last_active']
        })
    
    conn.close()
    
    return jsonify({'online_users': users})


# ==================== 启动入口 ====================

if __name__ == '__main__':
    init_db()
    print("🎰 百家乐后端服务启动: http://localhost:5000")
    print("📋 API 列表:")
    print("   - POST /api/register    注册")
    print("   - POST /api/login       登录")
    print("   - POST /api/logout      登出")
    print("   - GET  /api/user/info   用户信息")
    print("   - GET  /api/game/status 游戏状态(含倒计时)")
    print("   - POST /api/bet         下注")
    print("   - POST /api/deal        发牌")
    print("   - GET  /api/game        游戏历史")
    print("   - GET  /api/balance      余额查询")
    print("   - GET  /api/online/users 在线用户")
    app.run(host='0.0.0.0', port=5000, debug=True)
