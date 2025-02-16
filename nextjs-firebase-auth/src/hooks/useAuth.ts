import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  User,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { toast } from 'react-hot-toast';

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

interface UseAuthOptions {
  requireAuth?: boolean;
  persistSession?: boolean;
  autoLogoutTime?: number; // in minutes
}

export function useAuth(options: UseAuthOptions = {}) {
  const {
    requireAuth = false,
    persistSession = true,
    autoLogoutTime = 60, // 1 hour default
  } = options;

  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  const router = useRouter();
  let inactivityTimeout: NodeJS.Timeout;

  // Reset the auto-logout timer
  const resetInactivityTimer = () => {
    if (inactivityTimeout) {
      clearTimeout(inactivityTimeout);
    }
    if (authState.user && autoLogoutTime > 0) {
      inactivityTimeout = setTimeout(() => {
        handleSignOut();
        toast.error('Session expired. Please sign in again.');
      }, autoLogoutTime * 60 * 1000);
    }
  };

  // Handle user activity
  useEffect(() => {
    if (!authState.user || autoLogoutTime <= 0) return;

    // Events to track user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => resetInactivityTimer();

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    // Initial timer
    resetInactivityTimer();

    // Cleanup
    return () => {
      if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
      }
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [authState.user, autoLogoutTime]);

  // Set persistence and listen for auth state changes
  useEffect(() => {
    const setupAuth = async () => {
      try {
        // Set persistence
        await setPersistence(auth, persistSession ? browserLocalPersistence : browserSessionPersistence);

        // Listen for auth state changes
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          setAuthState(prev => ({ ...prev, user, loading: false }));

          if (requireAuth && !user) {
            router.push('/login');
          }
        });

        return unsubscribe;
      } catch (error) {
        console.error('Auth setup error:', error);
        setAuthState(prev => ({
          ...prev,
          error: 'Failed to setup authentication',
          loading: false,
        }));
      }
    };

    setupAuth();
  }, [requireAuth, persistSession, router]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Sign out error:', error);
      setAuthState(prev => ({
        ...prev,
        error: 'Failed to sign out',
      }));
    }
  };

  return {
    ...authState,
    signOut: handleSignOut,
    resetInactivityTimer,
  };
} 