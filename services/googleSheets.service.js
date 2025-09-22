const path = require('path');

// Try to require googleapis, but don't crash if it's not available
let google;
try {
    google = require('googleapis').google;
} catch (error) {
    console.log('googleapis package not found - Google Sheets integration disabled');
    google = null;
}

class GoogleSheetsService {
    constructor() {
        this.auth = null;
        this.sheets = null;
        this.isConfigured = false;
        this.spreadsheetId = '1iiaU92Hm071Rux5Pnkit24QDdK_Dh7rOuR8W53Zg_vc'; // Single spreadsheet with multiple sheets
        this.signInSheetName = 'sign in '; // Added trailing space to match actual sheet name
        this.signOutSheetName = 'sign out';
        console.log('Google Sheets service initialized');
    }

    async initializeAuth() {
        try {
            if (!google) {
                console.log('Google Sheets not available - googleapis package not installed');
                this.isConfigured = false;
                return;
            }

            // Check if credentials file exists
            const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || path.join(__dirname, '..', 'credentials', 'google-credentials.json');
            
            this.auth = new google.auth.GoogleAuth({
                keyFile: credentialsPath,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            this.isConfigured = true;
            console.log('Google Sheets authentication successful');
        } catch (error) {
            console.log('Google Sheets not configured - will only log to console');
            console.log('Error:', error.message);
            this.isConfigured = false;
        }
    }

    async logSignIn(driverId, driverName, openReading) {
        const now = new Date();
        const date = now.toLocaleDateString('en-IN');
        const time = now.toLocaleTimeString('en-IN');

        const data = {
            driverId,
            driverName,
            openReading,
            date,
            time
        };

        // Always log to console with nice formatting
        console.log('=== DRIVER SIGN-IN ===');
        console.log(`Driver ID: ${driverId}`);
        console.log(`Driver Name: ${driverName}`);
        console.log(`Open Reading: ${openReading}`);
        console.log(`Date: ${date}`);
        console.log(`Time: ${time}`);
        console.log(`Target Sheet: ${this.signInSheetName}`);
        console.log('=====================');

        // Try to save to Google Sheets
        try {
            if (!this.isConfigured) {
                await this.initializeAuth();
            }

            if (this.isConfigured && this.sheets) {
                const row = [driverId, driverName, openReading, date, time];
                
                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range: `'${this.signInSheetName}'!A:E`, // Added quotes around sheet name
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [row] },
                });

                console.log(`✅ Sign-in data saved to Google Sheets in "${this.signInSheetName}" sheet`);
            }
        } catch (error) {
            console.error('❌ Error saving sign-in to Google Sheets:', error.message);
            console.error('Sheet name used:', this.signInSheetName);
        }

        return data;
    }

    async logSignOut(driverId, driverName, closeReading, cashAmount) {
        const now = new Date();
        const date = now.toLocaleDateString('en-IN');
        const time = now.toLocaleTimeString('en-IN');

        const data = {
            driverId,
            driverName,
            closeReading,
            cashAmount,
            date,
            time
        };

        // Always log to console with nice formatting
        console.log('=== DRIVER SIGN-OUT ===');
        console.log(`Driver ID: ${driverId}`);
        console.log(`Driver Name: ${driverName}`);
        console.log(`Close Reading: ${closeReading}`);
        console.log(`Cash Amount: ${cashAmount}`);
        console.log(`Date: ${date}`);
        console.log(`Time: ${time}`);
        console.log(`Target Sheet: ${this.signOutSheetName}`);
        console.log('=======================');

        // Try to save to Google Sheets
        try {
            if (!this.isConfigured) {
                await this.initializeAuth();
            }

            if (this.isConfigured && this.sheets) {
                const row = [driverId, driverName, closeReading, cashAmount, date, time];
                
                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range: `'${this.signOutSheetName}'!A:F`, // Added quotes around sheet name
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [row] },
                });

                console.log(`✅ Sign-out data saved to Google Sheets in "${this.signOutSheetName}" sheet`);
            }
        } catch (error) {
            console.error('❌ Error saving sign-out to Google Sheets:', error.message);
            console.error('Sheet name used:', this.signOutSheetName);
        }

        return data;
    }
}

// Create a singleton instance
const googleSheetsService = new GoogleSheetsService();

module.exports = googleSheetsService;