// Local-dev entry point. Vercel uses api/index.ts instead.
import app from './app';

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`Voice AI Console Backend running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
