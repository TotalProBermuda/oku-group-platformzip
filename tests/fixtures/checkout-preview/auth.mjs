export const signOut = () => { throw new Error('Authentication mutations disabled in isolated fixture'); };
export const useSession = () => new URLSearchParams(location.search).get('account') === 'signed-in'
  ? { data: { user: { name: 'Isolated Buyer', email: 'buyer@example.invalid' } }, status: 'authenticated' }
  : { data: null, status: 'unauthenticated' };
