import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

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

export class AadhaarService {
  // DigiLocker Aadhaar JSON structure interface
  private static readonly DIGILOCKER_URL = 'https://www.digilocker.gov.in/';

  static redirectToDigiLocker(): void {
    // Open DigiLocker in a new tab
    const digiLockerUrl = 'https://www.digilocker.gov.in/';
    window.open(digiLockerUrl, '_blank', 'noopener,noreferrer');
  }

  static async extractAadhaarFromJSON(file: File): Promise<AadhaarDetails> {
    try {
      console.log('Starting Aadhaar JSON extraction...');
      
      // Verify it's a JSON file
      if (!file.name.toLowerCase().endsWith('.json')) {
        throw new Error('Please upload a JSON file downloaded from DigiLocker.');
      }

      // Read and parse JSON
      const text = await file.text();
      let jsonData: any;
      
      try {
        jsonData = JSON.parse(text);
      } catch (parseError) {
        throw new Error('Invalid JSON file. Please ensure you downloaded the correct Aadhaar JSON from DigiLocker.');
      }

      console.log('JSON parsed successfully, checking structure...');

      // Verify it's an Aadhaar JSON from DigiLocker
      if (!this.isValidAadhaarJSON(jsonData)) {
        throw new Error('This does not appear to be a valid Aadhaar JSON file from DigiLocker. Please download the correct file.');
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
      
      console.log('Successfully extracted Aadhaar details from JSON');
      return details;
      
    } catch (error) {
      console.error('Error extracting Aadhaar details from JSON:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to extract Aadhaar details from JSON file.');
    }
  }

  private static isValidAadhaarJSON(data: any): boolean {
    // Check for KycRes structure (DigiLocker format from your example)
    if (data.KycRes && data.KycRes.UidData) {
      return true;
    }

    // Check for direct Aadhaar structure
    if (data.uid || data.UID || data.aadhaarNumber || data.AadhaarNumber) {
      return true;
    }

    // Check for other common DigiLocker structures
    if (data.KycRes && (data.KycRes.Poi || data.KycRes.Poa)) {
      return true;
    }

    // Check for certificate structure
    if (data.CertificateData && data.CertificateData.certificate) {
      return true;
    }

    // Check for demographic data structure
    if (data.demographicData || data.DemographicData) {
      return true;
    }

    // Check for PrintLetterBWPhoto structure (common DigiLocker format)
    if (data.PrintLetterBWPhoto || data.printLetterBWPhoto) {
      return true;
    }

    return false;
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
      
      // Extract UID
      if (uidData['@uid']) {
        details.aadhaarNumber = uidData['@uid'].toString().replace(/\s/g, '');
        console.log('Found UID:', details.aadhaarNumber);
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
      // Ensure Aadhaar number is 12 digits
      const cleanAadhaar = details.aadhaarNumber.replace(/\D/g, '');
      if (cleanAadhaar.length === 12) {
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

  // Store Aadhaar recovery data on server
  static async storeAadhaarRecovery(
    userEmail: string, 
    aadhaarDetails: AadhaarDetails, 
    decryptionKey: any
  ): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/store-aadhaar-recovery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          userEmail,
          name: aadhaarDetails.name,
          aadhaarNumber: aadhaarDetails.aadhaarNumber,
          dob: aadhaarDetails.dob,
          gender: aadhaarDetails.gender,
          decryptionKey
        })
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to store recovery data');
      }
      
      console.log('Aadhaar recovery data stored successfully');
    } catch (error) {
      console.error('Error storing Aadhaar recovery data:', error);
      throw new Error('Failed to store recovery data on server');
    }
  }

  // Verify Aadhaar for recovery
  static async verifyAadhaarForRecovery(
    userEmail: string,
    aadhaarDetails: AadhaarDetails
  ): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-aadhaar-recovery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          userEmail,
          name: aadhaarDetails.name,
          aadhaarNumber: aadhaarDetails.aadhaarNumber,
          dob: aadhaarDetails.dob,
          gender: aadhaarDetails.gender
        })
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Verification failed');
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
