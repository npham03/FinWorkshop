import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';

export class UserModel {
  constructor(data) {
    this.id = data.id;
    this._id = data.id; // Compatibility with mongoose style
    this.username = data.username;
    this.email = data.email;
    this.passwordHash = data.password_hash || data.passwordHash;
    this.role = data.role;
    this.isActive = data.is_active !== undefined ? data.is_active : data.isActive;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  async comparePassword(rawPassword) {
    return bcrypt.compare(rawPassword, this.passwordHash);
  }
}

export const User = {
  async findById(id) {
    const res = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (!res.rows[0]) return null;
    return new UserModel(res.rows[0]);
  },

  async findByEmail(email) {
    const res = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (!res.rows[0]) return null;
    return new UserModel(res.rows[0]);
  },

  async findOne({ email }) {
    if (email) return this.findByEmail(email);
    return null;
  },

  async create({ username, email, password, passwordHash, role = 'accountant' }) {
    const finalHash = passwordHash || (await bcrypt.hash(password, 12));
    const res = await query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [username.trim(), email.trim().toLowerCase(), finalHash, role]
    );
    return new UserModel(res.rows[0]);
  },
};
