import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from '@/integrations/supabase/client';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface AadhaarDetails {
  name: string;
  aadhaarNumber: string;
  dob?: string;
  gender?: string;
}

export interface EncryptedAadhaarData {
  encryptedData: string;
  salt: string;
  iv: string;
}

// DigiLocker JSON validation patterns
const DIGILOCKER_PATTERNS = {
  // Common DigiLocker certificate identifiers
  CERTIFICATE_TYPES: [
    'AADHAAR',
    'AADHAR',
    'UIDAI',
    'UNIQUE IDENTIFICATION AUTHORITY OF INDIA'
  ],
  
  // Expected DigiLocker JSON structure signatures
  REQUIRED_FIELDS: [
    'KycRes',
    'UidData',
    'certificate',
    'CertificateData'
  ],
  
  // DigiLocker digital signature patterns
  SIGNATURE_PATTERNS: [
    'ds:Signature',
    'DigiSign',
    'UIDAI_SIGN',
    'xmldsig'
  ]
};

export class AadhaarService {
  // DigiLocker Aadhaar JSON structure interface
  private static readonly DIGILOCKER_URL = 'https://www.digilocker.gov.in/';

  static redirectToDigiLocker(): void {
    // Open DigiLocker in a new tab
    const digiLockerUrl = 'https://www.digilocker.gov.in/';
    window.open(digiLockerUrl, '_blank', 'noopener,noreferrer');
  }

  // Dev mode helper - generates fake Aadhaar details for testing
  static generateDevModeAadhaarDetails(): AadhaarDetails {
    return {
      name: 'TEST USER',
      aadhaarNumber: '123456789012',
      dob: '01/01/1990',
      gender: 'Male'
    };
  }

  static async extractAadhaarFromJSON(file: File): Promise<AadhaarDetails> {
    try {
      console.log('Starting Aadhaar JSON extraction with integrity checks...');
      
      // Verify it's a JSON file
      if (!file.name.toLowerCase().endsWith('.json')) {
        throw new Error('Please upload a JSON file downloaded from DigiLocker.');
      }

      // Check file size (DigiLocker JSONs are typically 1KB-50KB)
      if (file.size > 100 * 1024) { // 100KB limit
        throw new Error('File too large. DigiLocker Aadhaar JSON files are typically much smaller.');
      }

      if (file.size < 100) { // 100 bytes minimum
        throw new Error('File too small. This does not appear to be a valid DigiLocker JSON.');
      }

      // Read and parse JSON
      const text = await file.text();
      let jsonData: any;
      
      try {
        jsonData = JSON.parse(text);
      } catch (parseError) {
        throw new Error('Invalid JSON file. Please ensure you downloaded the correct Aadhaar JSON from DigiLocker.');
      }

      console.log('JSON parsed successfully, performing integrity checks...');

      // Perform comprehensive validation
      const validationResult = this.validateDigiLockerIntegrity(jsonData, text);
      if (!validationResult.isValid) {
        throw new Error(`Security validation failed: ${validationResult.error}`);
      }

      // Extract Aadhaar details from JSON
      const details = this.parseAadhaarFromJSON(jsonData);
      
      console.log('Extracted details:', {
        hasName: !!details.name,
        hasUid: !!details.aadhaarNumber,
        hasDob: !!details.dob,
        hasGender: !!details.gender
      });
      
      if (!details.name || !details.aadhaarNumber) {
        throw new Error('Could not extract required Aadhaar details (Name and Aadhaar Number) from the JSON file.');
      }

      // Additional validation of extracted data
      if (!this.validateExtractedData(details)) {
        throw new Error('Extracted data appears to be invalid or tampered with.');
      }

      console.log('Successfully extracted and validated Aadhaar details from JSON');
      return details;
      
    } catch (error) {
      console.error('Error extracting Aadhaar details from JSON:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to extract Aadhaar details from JSON file.');
    }
  }

  private static validateDigiLockerIntegrity(jsonData: any, rawText: string): { isValid: boolean; error?: string } {
    console.log('Performing DigiLocker integrity validation...');

    // Check 1: Verify DigiLocker JSON structure
    if (!this.hasValidDigiLockerStructure(jsonData)) {
      return { isValid: false, error: 'This does not appear to be a valid DigiLocker JSON file structure.' };
    }

    // Check 2: Look for DigiLocker-specific metadata
    if (!this.hasDigiLockerMetadata(jsonData, rawText)) {
      return { isValid: false, error: 'Missing DigiLocker authentication metadata. File may be tampered with.' };
    }

    // Check 3: Validate timestamp consistency



    // Check 5: Validate certificate structure if present
    if (!this.validateCertificateStructure(jsonData)) {
      return { isValid: false, error: 'Certificate structure validation failed.' };
    }

    console.log('DigiLocker integrity validation passed');
    return { isValid: true };
  }

  private static hasValidDigiLockerStructure(data: any): boolean {
    // Check for KycRes structure (most common DigiLocker format)
    if (data.KycRes && data.KycRes.UidData) {
      return true;
    }

    // Check for certificate structure
    if (data.CertificateData && data.CertificateData.certificate) {
      return true;
    }

    // Check for PrintLetterBWPhoto structure
    if (data.PrintLetterBWPhoto || data.printLetterBWPhoto) {
      return true;
    }

    // Check for other valid structures but be strict about it
    const hasValidRoot = DIGILOCKER_PATTERNS.REQUIRED_FIELDS.some(field => 
      data.hasOwnProperty(field)
    );

    return hasValidRoot;
  }

  private static hasDigiLockerMetadata(data: any, rawText: string): boolean {
    // Look for DigiLocker-specific patterns in the raw text
    const hasDigiLockerSignature = DIGILOCKER_PATTERNS.SIGNATURE_PATTERNS.some(pattern =>
      rawText.toLowerCase().includes(pattern.toLowerCase())
    );

    // Check for UIDAI certificate indicators
    const hasUidaiIndicators = DIGILOCKER_PATTERNS.CERTIFICATE_TYPES.some(type =>
      rawText.toUpperCase().includes(type)
    );

    // Look for DigiLocker timestamp patterns
    const hasTimestampPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(rawText);

    // Check for certificate number patterns
    const hasCertificatePattern = /[A-Z0-9\-]{10,}/.test(rawText);

    return hasDigiLockerSignature || hasUidaiIndicators || (hasTimestampPattern && hasCertificatePattern);
  }

  private static validateTimestamps(data: any): boolean {
    const timestamps: Date[] = [];
    
    // Recursively find all timestamp-like strings
    this.findTimestamps(data, timestamps);
    
    if (timestamps.length === 0) {
      // If no timestamps found, it might be suspicious for a DigiLocker file
      return false;
    }

    // Check if timestamps are reasonable (not in the future, not too old)
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    
    return timestamps.every(ts => ts <= now && ts >= oneYearAgo);
  }

  private static findTimestamps(obj: any, timestamps: Date[], depth: number = 0): void {
    if (depth > 10) return; // Prevent infinite recursion

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        
        // Check if value looks like a timestamp
        if (typeof value === 'string') {
          // ISO timestamp pattern
          if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              timestamps.push(date);
            }
          }
          // Unix timestamp pattern
          else if (/^\d{10,13}$/.test(value)) {
            const timestamp = parseInt(value);
            const date = new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000);
            if (!isNaN(date.getTime())) {
              timestamps.push(date);
            }
          }
        }
        
        // Recursively search nested objects
        if (typeof value === 'object' && value !== null) {
          this.findTimestamps(value, timestamps, depth + 1);
        }
      }
    }
  }

  private static detectSuspiciousModifications(data: any, rawText: string): boolean {
    // Check for obvious manual editing patterns
    const suspiciousPatterns = [
      // Common signs of manual editing
      /\s+\/\/\s*/,  // Comments
      /\s+#\s*/,     // Hash comments
      /TODO|FIXME|NOTE/i,
      /test|fake|dummy|sample/i,
      // Inconsistent formatting that suggests manual editing
      /"\s*:\s*"/,   // Unusual spacing
      /[{}]\s*[{}]/, // Adjacent braces
    ];

    const hasSuspiciousPatterns = suspiciousPatterns.some(pattern => 
      pattern.test(rawText)
    );

    // Check for inconsistent data types (sign of tampering)
    const hasInconsistentTypes = this.checkDataTypeConsistency(data);

    return hasSuspiciousPatterns || hasInconsistentTypes;
  }

  private static checkDataTypeConsistency(data: any): boolean {
    // In DigiLocker JSONs, certain fields should always be strings
    const stringFields = ['name', 'uid', 'dob', 'gender'];
    let inconsistencies = 0;

    this.checkFieldTypes(data, stringFields, 'string', (field, actualType) => {
      console.warn(`Field '${field}' expected to be string but found ${actualType}`);
      inconsistencies++;
    });

    // Too many inconsistencies suggests tampering
    return inconsistencies > 2;
  }

  private static checkFieldTypes(obj: any, expectedFields: string[], expectedType: string, onInconsistency: (field: string, actualType: string) => void, depth: number = 0): void {
    if (depth > 5) return;

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const lowerKey = key.toLowerCase();

        // Check if this field should be a specific type
        if (expectedFields.some(field => lowerKey.includes(field.toLowerCase()))) {
          if (typeof value !== expectedType && value !== null && value !== undefined) {
            onInconsistency(key, typeof value);
          }
        }

        // Recursively check nested objects
        if (typeof value === 'object' && value !== null) {
          this.checkFieldTypes(value, expectedFields, expectedType, onInconsistency, depth + 1);
        }
      }
    }
  }

  private static validateCertificateStructure(data: any): boolean {
    // If there's certificate data, validate its structure
    if (data.CertificateData || data.certificate) {
      const certData = data.CertificateData || data.certificate;
      
      // Certificate should have certain expected fields
      const hasValidCertStructure = (
        (certData.uid || certData.UID) &&
        (certData.name || certData.Name) &&
        (certData.certificate || typeof certData === 'object')
      );

      return hasValidCertStructure;
    }

    return true; // If no certificate data, validation passes
  }

  private static validateExtractedData(details: AadhaarDetails): boolean {
    // Validate name format
    if (details.name) {
      // Name should not contain numbers or special characters (except spaces and common punctuation)
      if (!/^[A-Za-z\s\.\-']+$/.test(details.name)) {
        console.warn('Name contains suspicious characters');
        return false;
      }
      
      // Name should not be too short or too long
      if (details.name.length < 2 || details.name.length > 100) {
        console.warn('Name length is suspicious');
        return false;
      }
    }

    // Validate Aadhaar number format
    if (details.aadhaarNumber) {
      const cleanAadhaar = details.aadhaarNumber.replace(/\s/g, '');
      
      // Should be 12 digits or masked format (at least 8 characters for partially masked)
      if (!/^[0-9x]{8,12}$/i.test(cleanAadhaar)) {
        console.warn('Aadhaar number format is invalid');
        return false;
      }
    }

    // Validate date of birth format if present
    if (details.dob) {
      // Should match common date formats
      const dateFormats = [
        /^\d{2}\/\d{2}\/\d{4}$/,  // DD/MM/YYYY
        /^\d{4}-\d{2}-\d{2}$/,    // YYYY-MM-DD
        /^\d{2}-\d{2}-\d{4}$/     // DD-MM-YYYY
      ];
      
      const isValidDateFormat = dateFormats.some(format => format.test(details.dob!));
      if (!isValidDateFormat) {
        console.warn('Date of birth format is invalid');
        return false;
      }
    }

    // Validate gender if present
    if (details.gender) {
      const validGenders = ['male', 'female', 'others', 'm', 'f', 'o'];
      if (!validGenders.includes(details.gender.toLowerCase())) {
        console.warn('Gender value is invalid');
        return false;
      }
    }

    return true;
  }

  private static parseAadhaarFromJSON(data: any): AadhaarDetails {
    const details: AadhaarDetails = {
      name: '',
      aadhaarNumber: ''
    };

    console.log('Parsing JSON data structure...');

    // Method 1: KycRes structure (from your example - this is the primary one)
    if (data.KycRes && data.KycRes.UidData) {
      console.log('Found KycRes.UidData structure');
      const uidData = data.KycRes.UidData;
      
      // Extract UID - handle both full and masked UIDs
      if (uidData['@uid']) {
        const uid = uidData['@uid'].toString().replace(/\s/g, '');
        details.aadhaarNumber = uid;
        console.log('Found UID:', uid);
      }
      
      // Extract POI (Proof of Identity) data
      if (uidData.Poi) {
        if (uidData.Poi['@name']) {
          details.name = uidData.Poi['@name'].toString().toUpperCase().trim();
          console.log('Found name:', details.name);
        }
        if (uidData.Poi['@dob']) {
          details.dob = uidData.Poi['@dob'].toString();
          console.log('Found DOB:', details.dob);
        }
        if (uidData.Poi['@gender']) {
          details.gender = this.normalizeGender(uidData.Poi['@gender']);
          console.log('Found gender:', details.gender);
        }
      }
    }

    // Method 2: Direct structure (fallback)
    if (!details.aadhaarNumber && (data.uid || data.UID)) {
      details.aadhaarNumber = (data.uid || data.UID).toString().replace(/\s/g, '');
    }
    if (!details.name && (data.name || data.Name)) {
      details.name = (data.name || data.Name).toString().toUpperCase().trim();
    }
    if (!details.dob && (data.dob || data.DOB || data.dateOfBirth)) {
      details.dob = (data.dob || data.DOB || data.dateOfBirth).toString();
    }
    if (!details.gender && (data.gender || data.Gender)) {
      details.gender = this.normalizeGender(data.gender || data.Gender);
    }

    // Method 3: Alternative KycRes structure
    if (!details.aadhaarNumber && data.KycRes) {
      const kycData = data.KycRes;
      
      if (kycData.UidData && kycData.UidData.uid) {
        details.aadhaarNumber = kycData.UidData.uid.toString().replace(/\s/g, '');
      }
      
      if (kycData.Poi) {
        if (!details.name && kycData.Poi.name) {
          details.name = kycData.Poi.name.toString().toUpperCase().trim();
        }
        if (!details.dob && kycData.Poi.dob) {
          details.dob = kycData.Poi.dob.toString();
        }
        if (!details.gender && kycData.Poi.gender) {
          details.gender = this.normalizeGender(kycData.Poi.gender);
        }
      }
    }

    // Method 4: Certificate structure
    if (!details.aadhaarNumber && data.CertificateData && data.CertificateData.certificate) {
      const cert = data.CertificateData.certificate;
      
      if (cert.uid) {
        details.aadhaarNumber = cert.uid.toString().replace(/\s/g, '');
      }
      if (!details.name && cert.name) {
        details.name = cert.name.toString().toUpperCase().trim();
      }
      if (!details.dob && cert.dob) {
        details.dob = cert.dob.toString();
      }
      if (!details.gender && cert.gender) {
        details.gender = this.normalizeGender(cert.gender);
      }
    }

    // Method 5: Demographic data structure
    if (!details.aadhaarNumber) {
      const demoData = data.demographicData || data.DemographicData;
      if (demoData) {
        if (demoData.uid) {
          details.aadhaarNumber = demoData.uid.toString().replace(/\s/g, '');
        }
        if (!details.name && demoData.name) {
          details.name = demoData.name.toString().toUpperCase().trim();
        }
        if (!details.dob && demoData.dob) {
          details.dob = demoData.dob.toString();
        }
        if (!details.gender && demoData.gender) {
          details.gender = this.normalizeGender(demoData.gender);
        }
      }
    }

    // Method 6: PrintLetterBWPhoto structure
    if (!details.aadhaarNumber) {
      const printData = data.PrintLetterBWPhoto || data.printLetterBWPhoto;
      if (printData) {
        if (printData.uid) {
          details.aadhaarNumber = printData.uid.toString().replace(/\s/g, '');
        }
        if (!details.name && printData.name) {
          details.name = printData.name.toString().toUpperCase().trim();
        }
        if (!details.dob && printData.dob) {
          details.dob = printData.dob.toString();
        }
        if (!details.gender && printData.gender) {
          details.gender = this.normalizeGender(printData.gender);
        }
      }
    }

    // Method 7: Try to find fields by searching through all properties recursively
    if (!details.aadhaarNumber || !details.name) {
      this.searchForFieldsRecursively(data, details);
    }

    // Validate and clean up the extracted data
    if (details.aadhaarNumber) {
      // For masked UIDs (like xxxxxxxx0511), accept them as valid
      // DigiLocker often provides partially masked UIDs for security
      const cleanAadhaar = details.aadhaarNumber.replace(/\s/g, '');
      if (cleanAadhaar.length >= 8) { // Accept masked UIDs (at least 8 chars)
        details.aadhaarNumber = cleanAadhaar;
      } else {
        details.aadhaarNumber = '';
      }
    }

    if (details.name) {
      // Clean up name
      details.name = details.name
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }

    console.log('Final parsed details:', {
      name: details.name,
      aadhaarNumber: details.aadhaarNumber ? `****${details.aadhaarNumber.slice(-4)}` : 'Not found',
      dob: details.dob,
      gender: details.gender
    });

    return details;
  }

  private static searchForFieldsRecursively(obj: any, details: AadhaarDetails, depth: number = 0): void {
    if (depth > 5) return; // Prevent infinite recursion

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const lowerKey = key.toLowerCase();

        // Look for UID/Aadhaar number
        if (!details.aadhaarNumber && (lowerKey.includes('uid') || lowerKey.includes('aadhaar'))) {
          if (typeof value === 'string' || typeof value === 'number') {
            const cleanValue = value.toString().replace(/\D/g, '');
            if (cleanValue.length === 12) {
              details.aadhaarNumber = cleanValue;
            }
          }
        }

        // Look for name
        if (!details.name && lowerKey.includes('name') && typeof value === 'string') {
          if (value.length > 2 && value.length < 100) {
            details.name = value.toString().toUpperCase().trim();
          }
        }

        // Look for DOB
        if (!details.dob && (lowerKey.includes('dob') || lowerKey.includes('birth')) && typeof value === 'string') {
          details.dob = value.toString();
        }

        // Look for gender
        if (!details.gender && lowerKey.includes('gender') && typeof value === 'string') {
          details.gender = this.normalizeGender(value);
        }

        // Recursively search nested objects
        if (typeof value === 'object' && value !== null) {
          this.searchForFieldsRecursively(value, details, depth + 1);
        }
      }
    }
  }

  private static normalizeGender(gender: string): string {
    const g = gender.toString().toLowerCase().trim();
    if (g.includes('male') && !g.includes('female')) {
      return 'Male';
    } else if (g.includes('female')) {
      return 'Female';
    } else if (g.includes('other') || g.includes('transgender')) {
      return 'Others';
    }
    return gender.toString();
  }

  // Legacy PDF methods - keeping for backward compatibility but marking as deprecated
  static async extractAadhaarFromPDF(file: File): Promise<AadhaarDetails> {
    throw new Error('PDF extraction is no longer supported. Please use DigiLocker JSON files instead.');
  }

  // Store Aadhaar recovery data on server using Supabase Edge Functions
  static async storeAadhaarRecovery(
    userEmail: string, 
    aadhaarDetails: AadhaarDetails, 
    decryptionKey: any
  ): Promise<void> {
    try {
      console.log('Storing Aadhaar recovery data for:', userEmail);
      
      const { data, error } = await supabase.functions.invoke('store-aadhaar-recovery', {
        body: {
          userEmail,
          name: aadhaarDetails.name,
          aadhaarNumber: aadhaarDetails.aadhaarNumber,
          dob: aadhaarDetails.dob,
          gender: aadhaarDetails.gender,
          decryptionKey
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to store recovery data');
      }
      
      console.log('Aadhaar recovery data stored successfully');
    } catch (error) {
      console.error('Error storing Aadhaar recovery data:', error);
      throw new Error('Failed to store recovery data on server');
    }
  }

  // Verify Aadhaar for recovery using Supabase Edge Functions
  static async verifyAadhaarForRecovery(
    userEmail: string,
    aadhaarDetails: AadhaarDetails
  ): Promise<void> {
    try {
      const { data, error } = await supabase.functions.invoke('verify-aadhaar-recovery', {
        body: {
          userEmail,
          name: aadhaarDetails.name,
          aadhaarNumber: aadhaarDetails.aadhaarNumber,
          dob: aadhaarDetails.dob,
          gender: aadhaarDetails.gender
        }
      });

      if (error) {
        throw new Error(error.message || 'Verification failed');
      }
      
      console.log('Aadhaar verification successful');
    } catch (error) {
      console.error('Error verifying Aadhaar:', error);
      throw error;
    }
  }

  // Legacy methods for backward compatibility (now deprecated)
  static async encryptAadhaarDetails(details: AadhaarDetails): Promise<EncryptedAadhaarData> {
    console.warn('encryptAadhaarDetails is deprecated. Use server-side storage instead.');
    return {
      encryptedData: '',
      salt: '',
      iv: ''
    };
  }

  static async decryptAadhaarDetails(encryptedData: EncryptedAadhaarData): Promise<AadhaarDetails> {
    console.warn('decryptAadhaarDetails is deprecated. Use server-side verification instead.');
    return {
      name: '',
      aadhaarNumber: ''
    };
  }

  static verifyAadhaarMatch(provided: AadhaarDetails, stored: AadhaarDetails): boolean {
    console.warn('verifyAadhaarMatch is deprecated. Use server-side verification instead.');
    return false;
  }
}
