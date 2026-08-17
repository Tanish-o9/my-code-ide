import { useState, useEffect } from 'react';
import { useAuthStore } from '../../shared/stores/useAuthStore';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { api } from '../../shared/lib/api';
import LoginPage from '../auth/LoginPage';
import RegisterPage from '../auth/RegisterPage';
import { Sparkles, Loader2, CheckCircle, ShieldAlert } from 'lucide-react';

interface AcceptInviteProps {
  token: string;
  onComplete: () => void;
}

interface InviteDetails {
  email: string;
  role: string;
  workspaceName: string;
  workspaceId: string;
}

export default function AcceptInvite({ token, onComplete }: AcceptInviteProps) {
  const { isAuthenticated, user } = useAuthStore();
  const { setActiveWorkspace } = useWorkspaceStore();

  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');

  // 1. Fetch token details on load
  const fetchDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/invites/${token}`);
      setDetails(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invitation is invalid, expired, or already accepted.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [token]);

  // 2. If user registers/logs in, check if their email aligns with the invite
  useEffect(() => {
    if (isAuthenticated && user && details) {
      if (user.email.toLowerCase() === details.email.toLowerCase()) {
        // If registration was just completed, the invite might already be auto-accepted in backend.
        // Let's call accept to verify and trigger redirection.
        handleAccept();
      }
    }
  }, [isAuthenticated, user, details]);

  const handleAccept = async () => {
    if (accepting) return;
    setAccepting(true);
    try {
      const res = await api.post(`/invites/${token}/accept`);
      
      // Fetch updated workspace info and load it
      const wsId = res.data.workspaceId || details?.workspaceId;
      if (wsId) {
        const workspaceRes = await api.get(`/workspaces/${wsId}`);
        setActiveWorkspace(workspaceRes.data);
      }
      onComplete();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to accept invitation.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center w-screen h-screen bg-[#121214] text-white">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-xs text-gray-400 font-medium">Resolving workspace collaboration keys...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center w-screen h-screen bg-[#121214] text-white px-4 text-center">
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl mb-4">
          <ShieldAlert className="w-10 h-10 text-red-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">Invitation Error</h2>
        <p className="text-sm text-gray-400 max-w-sm mb-6">{error}</p>
        <button
          onClick={() => {
            window.location.pathname = '/';
          }}
          className="px-6 py-2.5 bg-[#1c1c1f] hover:bg-[#2d2d30] border border-[#2d2d30] rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  // 3. User is logged in but emails do not align
  if (isAuthenticated && user && details && user.email.toLowerCase() !== details.email.toLowerCase()) {
    return (
      <div className="flex flex-col justify-center items-center w-screen h-screen bg-[#121214] text-white px-4 text-center">
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl mb-4">
          <ShieldAlert className="w-10 h-10 text-yellow-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">Account Mismatch</h2>
        <p className="text-sm text-gray-400 max-w-md mb-2">
          This invitation was sent to <strong className="text-blue-400">{details.email}</strong>.
        </p>
        <p className="text-sm text-gray-400 max-w-md mb-6">
          You are currently signed in as <strong className="text-gray-200">{user.email}</strong>.
        </p>
        <button
          onClick={async () => {
            await api.post('/auth/logout');
            window.location.reload();
          }}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer"
        >
          Sign Out to Accept Invite
        </button>
      </div>
    );
  }

  // 4. User is logged in and aligned, render Accept Invitation card
  if (isAuthenticated && user && details) {
    return (
      <div className="flex flex-col justify-center items-center w-screen h-screen bg-[#121214] text-white px-4">
        <div className="w-full max-w-md bg-[#1c1c1f]/80 backdrop-blur-xl border border-[#2d2d30] rounded-2xl p-8 shadow-2xl text-center">
          <div className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-2xl mb-4 inline-block">
            <Sparkles className="w-8 h-8 text-blue-400 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold mb-1">Join Workspace</h2>
          <p className="text-xs text-gray-400 mb-6">
            You've been invited to join <strong className="text-white">{details.workspaceName}</strong> as an <strong className="text-blue-400 uppercase tracking-wider">{details.role}</strong>.
          </p>

          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-semibold text-white transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
          >
            {accepting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle size={15} />
                <span>Accept and Launch IDE</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // 5. User is NOT logged in, render LoginPage/RegisterPage inline with invite context
  return (
    <div className="w-screen h-screen bg-[#121214] text-white relative overflow-y-auto">
      <div className="max-w-md mx-auto py-12 px-4">
        <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-4 mb-6 text-center text-xs">
          <span className="text-gray-300">You've been invited to join </span>
          <strong className="text-white">{details?.workspaceName}</strong>
          <span className="text-gray-300"> as an </span>
          <strong className="text-blue-400 uppercase tracking-wider">{details?.role}</strong>.
          <p className="text-gray-400 mt-1">Please sign in or register below with {details?.email} to join.</p>
        </div>

        {authMode === 'login' ? (
          <LoginPage onSwitchToRegister={() => setAuthMode('register')} />
        ) : (
          <RegisterPage 
            onSwitchToLogin={() => setAuthMode('login')} 
            inviteToken={token}
          />
        )}
      </div>
    </div>
  );
}
