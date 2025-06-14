import { PasswordStorageService } from '@/lib/passwordStorage';
import { EncryptionKey } from '@/lib/encryption';
import { AadhaarService, AadhaarDetails } from '@/lib/aadhaarService';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/hooks/use-toast';

interface UseImportVaultFlowProps {
  onVaultLoaded: (encryptionKey: EncryptionKey) => void;
  onError: (error: string) => void;
  onVaultFileSelected: (file: File) => void;
  setIsImporting: (loading: boolean) => void;
}

export const useImportVaultFlow = ({
  onVaultLoaded,
  onError,
  onVaultFileSelected,
  setIsImporting
}: UseImportVaultFlowProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const handleImportVault = () => {
    const vaultInput = document.createElement('input');
    vaultInput.type = 'file';
    vaultInput.accept = '.json';
    vaultInput.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        onVaultFileSelected(file);
        promptForDecryptionKey(file);
      }
    };
    vaultInput.click();
  };

  const promptForDecryptionKey = (vaultFile: File) => {
    const keyInput = document.createElement('input');
    keyInput.type = 'file';
    keyInput.accept = '.json';
    keyInput.onchange = async (e) => {
      const keyFile = (e.target as HTMLInputElement).files?.[0];
      if (keyFile) {
        await processImport(vaultFile, keyFile);
      }
    };
    keyInput.click();
  };

  const processImport = async (vaultFile: File, keyFile: File) => {
    setIsImporting(true);
    onError('');

    try {
      const vaultText = await vaultFile.text();
      const keyText = await keyFile.text();
      
      // Parse the files
      let vault, encryptionKey: EncryptionKey;
      
      try {
        vault = JSON.parse(vaultText);
        encryptionKey = JSON.parse(keyText);
      } catch (parseError) {
        throw new Error('Invalid file format. Please check your vault and key files.');
      }

      // Validate encryption key structure
      if (!encryptionKey.key || !encryptionKey.salt || !encryptionKey.timestamp) {
        throw new Error('Invalid encryption key file format.');
      }

      // Test decryption by trying to decrypt the vault
      if (user) {
        // First, save the encrypted vault data
        if (vault.encryptedVault) {
          // This is an exported vault with encrypted data
          localStorage.setItem(`vault_${user.uid}`, vault.encryptedVault);
        } else {
          // This might be raw vault data, encrypt it first
          const vaultData = JSON.stringify(vault);
          localStorage.setItem(`vault_${user.uid}`, vaultData);
        }
        
        // Test if we can decrypt it
        const testVault = PasswordStorageService.getVault(user.uid, encryptionKey);
        
        // If we get here, decryption worked
        localStorage.setItem(`encryption_key_${user.uid}`, keyText);
      }

      onVaultLoaded(encryptionKey);
      
      toast({
        title: "Success",
        description: "Vault imported successfully",
      });
    } catch (error: any) {
      console.error('Import error:', error);
      onError(error.message || 'Failed to import vault. Please check your files.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleLostDecryptionKey = async (vaultFile: File, aadhaarDetails: AadhaarDetails) => {
    try {
      if (!user) {
        onError('User authentication required for recovery');
        return;
      }

      setIsImporting(true);
      onError('');

      const vaultText = await vaultFile.text();
      const vault = JSON.parse(vaultText);

      // Use server-side verification with email recovery
      try {
        await AadhaarService.verifyAadhaarForRecovery(user.email || '', aadhaarDetails);
        
        toast({
          title: "Identity Verified Successfully",
          description: "Your decryption key has been sent to your registered email address. Please check your inbox and use the key to recover your vault.",
          duration: 8000,
        });
        
        // Clear any previous errors
        onError('');
        
      } catch (verifyError: any) {
        console.error('Aadhaar verification failed:', verifyError);
        onError(verifyError.message || 'Failed to verify Aadhaar details. Please ensure the information matches your stored records.');
      }
    } catch (error: any) {
      console.error('Recovery process failed:', error);
      onError('Failed to process recovery request. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  return {
    handleImportVault,
    handleLostDecryptionKey
  };
};
