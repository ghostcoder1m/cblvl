import { auth } from '../firebaseAdmin';
import { DecodedIdToken } from 'firebase-admin/auth';

export async function verifyIdToken(token: string): Promise<DecodedIdToken | null> {
  try {
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying token:', error);
    return null;
  }
} 