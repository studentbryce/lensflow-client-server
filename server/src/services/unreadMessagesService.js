/** Shared unread count for authenticated participants; Supabase RLS scopes rows. */
// Helper function to get the count of unread messages for a specific user, ensuring the user is authenticated and handling potential database errors
export async function getUnreadMessageCount(db, userId) {
  if (!userId) { const error = new Error('Sign in required.'); error.status = 401; error.code = 'UNAUTHORIZED'; throw error; }
  const { count, error } = await db.from('messages').select('message_id', { count: 'exact', head: true })
    .eq('is_read', false).neq('sender_id', userId);
  if (error) { const failure = new Error('Unable to load unread message count.'); failure.cause = error; throw failure; }
  return { count: count ?? 0 };
}
