import React, { useState } from 'react';
import { useAuthStore } from '../../shared/stores/useAuthStore';
import { api } from '../../shared/lib/api';
import { Mail, Lock, User, Sparkles, Loader2 } from 'lucide-react';

interface RegisterPageProps {
  onSwitchToLogin: () => void;
  inviteToken?: string | null;
}

export default function RegisterPage({ onSwitchToLogin, inviteToken }: RegisterPageProps) {
  const { login } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await api.post('/auth/register', { name, email, password, inviteToken });
      const { user, accessToken } = response.data;
      login(user, accessToken);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col justify-center items-center w-full h-full min-h-screen bg-[#121214] overflow-hidden px-4">
      {/* Background ambient glows */}
      <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] rounded-full bg-blue-600/10 blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] rounded-full bg-purple-600/10 blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md z-10">
        {/* Brand logo or name */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-xl mb-3 shadow-lg shadow-blue-500/5">
            <Sparkles className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Create your account</h1>
          <p className="text-xs text-gray-400 mt-1">Get started with your browser-based collaborative workspace</p>
        </div>

        {/* Card container */}
        <div className="bg-[#1c1c1f]/80 backdrop-blur-xl border border-[#2d2d30] rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/20 text-red-400 text-xs text-center">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Full Name</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                  <User size={16} />
                </span>
                <input 
                  type="text"
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-[#141416] border border-[#2d2d30] rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                  <Mail size={16} />
                </span>
                <input 
                  type="email"
                  id="email"
                  name="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full bg-[#141416] border border-[#2d2d30] rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                  <Lock size={16} />
                </span>
                <input 
                  type="password"
                  id="password"
                  name="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full bg-[#141416] border border-[#2d2d30] rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Confirm Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                  <Lock size={16} />
                </span>
                <input 
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#141416] border border-[#2d2d30] rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  required
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center space-x-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors cursor-pointer shadow-lg shadow-blue-500/10 disabled:opacity-50 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <span>Register</span>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs">
            <span className="text-gray-400">Already have an account? </span>
            <button 
              onClick={onSwitchToLogin}
              className="text-blue-400 hover:text-blue-300 font-semibold underline underline-offset-4 cursor-pointer"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
