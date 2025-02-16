import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { auth } from '../firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/dashboard').then(() => setLoading(false));
      } else {
        router.push('/login').then(() => setLoading(false));
      }
    });

    // Clean up subscription
    return () => {
      unsubscribe();
      setLoading(false);
    };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  // This should never be visible as we're always redirecting
  return null;
}
