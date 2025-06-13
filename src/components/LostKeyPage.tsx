import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Key, Shield, AlertTriangle, ArrowLeft, Trash2, Mail, ExternalLink } from 'lucide-react';
import AadhaarVerification from './AadhaarVerification';
import { AadhaarDetails, AadhaarService } from '@/lib/aadhaarService';
import { useAuth } from './AuthProvider';
import { useToast } from '@/hooks/use-toast';

interface LostKeyPageProps {
  onBack: () => void;
  onKeyRecovered: () => void;
}

const LostKeyPage: React.FC<LostKeyPageProps> = ({ onBack, onKeyRecovered }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showAadhaarVerification, setShowAadhaarVerification] = useState(false);
  const [recoveryMethod, setRecoveryMethod] = useState<'recover' | 'generate' | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [userEmail, setUserEmail] = useState(user?.email || '');
  const [isRecovering, setIsRecovering] = useState(false);

  const handleRecoverKey = () => {
    if (!userEmail.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter your email address to proceed with recovery",
        variant: "destructive",
      });
      return;
    }
    setRecoveryMethod('recover');
    setShowAadhaarVerification(true);
  };

  const handleGenerateNewKey = () => {
    setRecoveryMethod('generate');
    setShowConfirmDelete(true);
  };

  const handleAadhaarVerification = async (aadhaarDetails: AadhaarDetails) => {
    setIsRecovering(true);
    try {
      // Verify Aadhaar details with server
      await AadhaarService.verifyAadhaarForRecovery(userEmail, aadhaarDetails);
      
      toast({
        title: "Recovery Request Sent",
        description: "Your identity has been verified. The decryption key has been sent to your email address.",
      });
      
      setShowAadhaarVerification(false);
      onKeyRecovered();
    } catch (error: any) {
      toast({
        title: "Recovery Failed",
        description: error.message || "Failed to verify your identity. Please check your details and try again.",
        variant: "destructive",
      });
    } finally {
      setIsRecovering(false);
      setShowAadhaarVerification(false);
    }
  };

  const handleConfirmNewKey = () => {
    if (!user) return;

    try {
      // Clear existing vault data
      localStorage.removeItem(`vault_${user.uid}`);
      localStorage.removeItem(`encryption_key_${user.uid}`);
      
      toast({
        title: "Vault Reset",
        description: "All data has been cleared. You can now create a new vault.",
      });
      
      onKeyRecovered();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reset vault",
        variant: "destructive",
      });
    }
  };

  if (showAadhaarVerification) {
    return (
      <AadhaarVerification
        title="Verify Identity for Key Recovery"
        description="Use your DigiLocker Aadhaar JSON to verify your identity and recover your decryption key"
        onVerificationComplete={handleAadhaarVerification}
        onCancel={() => {
          setShowAadhaarVerification(false);
          setRecoveryMethod(null);
        }}
        isLoading={isRecovering}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" size="icon" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lost Decryption Key</h1>
            <p className="text-muted-foreground">Recover your key or start fresh</p>
          </div>
        </div>

        {showConfirmDelete ? (
          <div className="bg-card rounded-lg p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Warning: Data Loss</h2>
              <p className="text-muted-foreground">
                Generating a new key will permanently delete all your saved passwords. 
                This action cannot be undone.
              </p>
            </div>

            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
              <h3 className="font-medium text-destructive mb-2">What will be deleted:</h3>
              <ul className="text-sm text-destructive space-y-1">
                <li>• All saved passwords</li>
                <li>• Account recovery information</li>
                <li>• Sync history</li>
                <li>• All vault data</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleConfirmNewKey}
                variant="destructive"
                className="flex-1"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete All & Generate New Key
              </Button>
              <Button
                onClick={() => setShowConfirmDelete(false)}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Email Input for Recovery */}
            <div className="bg-card rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Email Address</h3>
              <div className="space-y-2">
                <Label htmlFor="email">Enter your registered email address</Label>
                <Input
                  id="email"
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground">
                  This should be the same email address you used when setting up your vault.
                </p>
              </div>
            </div>

            {/* Recovery Option */}
            <div className="bg-card rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-6 h-6 text-blue-600" />
                <h2 className="text-lg font-semibold">Recover Existing Key</h2>
              </div>
              
              <p className="text-muted-foreground mb-4">
                Use Aadhaar verification to recover your decryption key. 
                The key will be sent to your registered email address.
              </p>
              
              <div className="bg-accent rounded-lg p-4 mb-4">
                <h3 className="font-medium mb-2">Requirements:</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Aadhaar JSON file from DigiLocker (same as used during setup)</li>
                  <li>• Correct email address</li>
                  <li>• Same Aadhaar details used during initial setup</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                  <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">How it works:</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>Download your Aadhaar JSON from DigiLocker</li>
                      <li>Upload the JSON file for verification</li>
                      <li>Our secure server verifies your identity</li>
                      <li>If verified, your decryption key is sent to your email</li>
                      <li>Download the key and import it to access your vault</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                  <ExternalLink className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium mb-1">Need your Aadhaar JSON?</p>
                    <p className="text-xs">Visit DigiLocker, sign in with your Aadhaar, and download your Aadhaar document in JSON format.</p>
                  </div>
                </div>
              </div>
              
              <Button 
                onClick={handleRecoverKey} 
                className="w-full"
                disabled={!userEmail.trim()}
              >
                <Key className="w-4 h-4 mr-2" />
                Recover Decryption Key
              </Button>
            </div>

            {/* Generate New Key Option */}
            <div className="bg-card rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
                <h2 className="text-lg font-semibold">Generate New Key</h2>
              </div>
              
              <p className="text-muted-foreground mb-4">
                Start fresh with a new decryption key. This will permanently delete 
                all your existing password data.
              </p>
              
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
                <h3 className="font-medium text-destructive mb-2">⚠️ Warning:</h3>
                <p className="text-sm text-destructive">
                  This action is irreversible. All your saved passwords will be lost forever.
                </p>
              </div>
              
              <Button 
                onClick={handleGenerateNewKey}
                variant="destructive"
                className="w-full"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Generate New Key
              </Button>
            </div>

            {/* Help Section */}
            <div className="bg-accent rounded-lg p-4">
              <h3 className="font-medium mb-2">Need Help?</h3>
              <p className="text-sm text-muted-foreground">
                If you're having trouble with key recovery, make sure you're using the same 
                Aadhaar JSON from DigiLocker and email address that were used during the initial setup of your vault.
                The recovery process is rate-limited to 5 attempts per 24 hours for security.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LostKeyPage;