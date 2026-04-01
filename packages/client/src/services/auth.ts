import { GET, POST } from './api.js';
import type { User } from '@gamepanel/shared';

let currentUser: User | null = null;
const listeners = new Set<(user: User | null) => void>();

export function getUser(): User | null {
  return currentUser;
}

export function onAuthChange(fn: (user: User | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn(currentUser);
}

export async function checkAuth(): Promise<User | null> {
  try {
    const res = await GET<{ data: User }>('/api/auth/me');
    currentUser = res.data;
  } catch {
    currentUser = null;
  }
  notify();
  return currentUser;
}

export async function login(username: string, password: string): Promise<User> {
  const res = await POST<{ data: User }>('/api/auth/login', { username, password });
  currentUser = res.data;
  notify();
  return res.data;
}

export async function logout(): Promise<void> {
  await POST('/api/auth/logout');
  currentUser = null;
  notify();
}
