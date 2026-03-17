# Multipart Form Data Setup Required

The FileUploadController requires multer middleware for handling multipart/form-data uploads.

## Installation

```bash
cd /Users/arthurren/projects/AIOpc/platform/backend
pnpm add multer @types/multer
```

## Configuration

Add to `/Users/arthurren/projects/AIOpc/platform/backend/src/app.ts`:

```typescript
import multer from 'multer';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Make upload middleware available globally
app.use((req, res, next) => {
  (req as any).upload = upload;
  next();
});
```

## Integration

The FileUploadController will then use:

```typescript
@Post('/upload')
async uploadFile(@Req() req: AuthRequest): Promise<UploadResponse> {
  // Access file via req.file
  const file = (req as any).file;
}
```

With route configuration:

```typescript
// In route setup or controller decorator
@Post('/upload', upload.single('file'))
async uploadFile(@Req() req: AuthRequest): Promise<UploadResponse> {
  // req.file is populated by multer
}
```

## TODO

This configuration is pending. The FileUploadController is designed to work
with multer but requires the middleware to be set up in app.ts.
