// Controller function to get the current authenticated user's information
export function getCurrentUser(req, res) {
    return res.status(200).json({
        success: true,
        data: {
            user_id: req.user.id,
            email: req.user.email ?? null,
        },
    });
}
