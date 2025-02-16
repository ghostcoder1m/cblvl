import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { auth } from '../firebaseConfig';
import { sendEmailVerification, onAuthStateChanged } from 'firebase/auth';
import { toast } from 'react-hot-toast';

export default function VerifyEmail() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/login');
      } else if (user.emailVerified) {
        router.push('/dashboard');
      } else {
        setUser(user);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleResendVerification = async () => {
    if (!user || countdown > 0) return;

    setLoading(true);
    try {
      await sendEmailVerification(user);
      setCountdown(60); // 60 seconds cooldown
      toast.success('Verification email sent! Please check your inbox.');
    } catch (error: any) {
      console.error('Error sending verification email:', error);
      toast.error('Failed to send verification email. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!user) return;

    setLoading(true);
    try {
      await user.reload();
      if (user.emailVerified) {
        toast.success('Email verified successfully!');
        router.push('/dashboard');
      } else {
        toast.error('Email not verified yet. Please check your inbox.');
      }
    } catch (error) {
      console.error('Error checking verification status:', error);
      toast.error('Failed to check verification status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Verify your email
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          We've sent a verification email to {user.email}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            <div className="text-sm text-gray-600 text-center">
              <p>Please check your email and click the verification link.</p>
              <p className="mt-2">
                If you don't see the email, check your spam folder.
              </p>
            </div>

            <div className="space-y-4">
              <button
                onClick={handleRefreshStatus}
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Checking...' : 'I've verified my email'}
              </button>

              <button
                onClick={handleResendVerification}
                disabled={loading || countdown > 0}
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {countdown > 0
                  ? `Resend in ${countdown}s`
                  : loading
                  ? 'Sending...'
                  : 'Resend verification email'}
              </button>
            </div>

            <div className="text-center">
              <button
                onClick={() => auth.signOut().then(() => router.push('/login'))}
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                Sign out and use a different account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 