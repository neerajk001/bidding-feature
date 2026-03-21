"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.maybeUpload = maybeUpload;
const multer_1 = __importDefault(require("multer"));
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
function maybeUpload(req, res, next) {
    if (req.headers['content-type']?.includes('multipart/form-data')) {
        return upload.fields([
            { name: 'bannerImage', maxCount: 1 },
            { name: 'reelVideo', maxCount: 1 }
        ])(req, res, next);
    }
    return next();
}
