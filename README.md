# Secure Password Manager with Aadhaar Recovery

A production-ready password manager with end-to-end encryption and secure Aadhaar-based key recovery.

## Features

### 🔐 Security Features
- **End-to-end encryption** using AES-256 with PBKDF2 key derivation
- **Offline-first architecture** - your data never leaves your device unencrypted
- **Secure Aadhaar verification** for key recovery
- **Biometric authentication** support (fingerprint/face recognition)
- **Rate limiting** on recovery attempts (5 attempts per 24 hours)
- **bcrypt encryption** for server-side data storage

### 📱 Core Functionality
- **Password storage and management** with categories
- **Strong password generation** with customizable options
- **Password strength analysis** and breach monitoring
- **Google Drive sync** for encrypted backups
- **Import/Export** encrypted vault files
- **Dark/Light theme** support

### 🆔 Aadhaar Integration
- **Smart PDF validation** - only accepts valid Aadhaar documents
- **Accurate data extraction** using PDF.js with pattern matching
- **Server-side verification** with encrypted storage
- **Email-based key recovery** after successful verification
- **Production-ready security** with Supabase backend

## Setup Instructions

### 1. Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to Settings > API and copy your project URL and anon key
3. Run the database migration:
   ```sql
   -- Copy and run the SQL from supabase/migrations/create_aadhaar_recovery.sql
   ```
4. Deploy the edge functions:
   ```bash
   # Install Supabase CLI first
   npm install -g @supabase/cli
   
   # Login to Supabase
   supabase login
   
   # Link your project
   supabase link --project-ref your-project-ref
   
   # Deploy functions
   supabase functions deploy store-aadhaar-recovery
   supabase functions deploy verify-aadhaar-recovery
   ```

### 2. Firebase Setup (for Google Auth)

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Google Authentication in Authentication > Sign-in method
3. Add your domain to authorized domains
4. Copy your Firebase config values

### 3. Environment Variables

Create a `.env` file in the root directory:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# Firebase
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

### 4. Install and Run

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Security Architecture

### Client-Side Security
- **AES-256 encryption** with unique salt per user
- **PBKDF2 key derivation** (10,000 iterations)
- **Local storage only** for encrypted data
- **No plaintext data** ever sent to servers

### Server-Side Security
- **bcrypt hashing** (12 rounds) for Aadhaar data
- **Unique salt** per user for additional security
- **Rate limiting** to prevent brute force attacks
- **Row Level Security (RLS)** in Supabase
- **Service role isolation** for sensitive operations

### Aadhaar Verification Process
1. **PDF Validation**: Checks for valid Aadhaar document structure
2. **Data Extraction**: Uses PDF.js with regex patterns for accurate extraction
3. **Server Verification**: Compares bcrypt hashes of provided vs stored data
4. **Email Delivery**: Sends decryption key to verified email address
5. **Attempt Tracking**: Limits recovery attempts to prevent abuse

## API Endpoints

### Store Aadhaar Recovery Data
```
POST /functions/v1/store-aadhaar-recovery
```
Stores encrypted Aadhaar data and decryption key for recovery.

### Verify Aadhaar for Recovery
```
POST /functions/v1/verify-aadhaar-recovery
```
Verifies Aadhaar details and sends decryption key via email.

## Production Deployment

### Security Checklist
- [ ] Enable HTTPS/SSL certificates
- [ ] Configure proper CORS policies
- [ ] Set up email service (SendGrid/AWS SES) for key delivery
- [ ] Enable Supabase RLS policies
- [ ] Configure rate limiting at CDN level
- [ ] Set up monitoring and logging
- [ ] Regular security audits

### Performance Optimization
- [ ] Enable Supabase connection pooling
- [ ] Configure CDN for static assets
- [ ] Implement proper caching strategies
- [ ] Monitor database performance
- [ ] Set up automated backups

## Troubleshooting

### Common Issues

1. **PDF extraction fails**
   - Ensure PDF is not password-protected
   - Check file size (must be under 5MB)
   - Verify it's an official UIDAI Aadhaar document

2. **Google Auth 401 errors**
   - Check Firebase configuration
   - Verify authorized domains
   - Ensure proper scopes are requested

3. **Supabase connection issues**
   - Verify environment variables
   - Check RLS policies
   - Ensure edge functions are deployed

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Security Disclosure

If you discover a security vulnerability, please email security@yourcompany.com instead of using the issue tracker.