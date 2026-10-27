// Controller function to check the health of the LensFlow API
export function getHealth(req, res) {
    res.status(200).json({
        success: true,
        message: 'LensFlow API is running'
    });
}
