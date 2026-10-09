import { supabaseAuth } from '../config/supabaseAuth.js';

export async function requireAuth(req, res, next) {
    const authorization = req.get('authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);

    if (!match) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'A valid Bearer token is required.',
            },
        });
    }

    try {
        // getUser(token) asks Supabase Auth to validate the access token.
        // Never trust an unverified decoded JWT or user ID from the request body.
        const { data, error } = await supabaseAuth.auth.getUser(match[1]);

        if (error || !data?.user) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Your session is invalid or has expired.',
                },
            });
        }

        req.user = data.user;
        req.accessToken = match[1]; // Used in Milestone 3 for user-scoped RLS queries.
        next();
    } catch (error) {
        next(error);
    }
}
