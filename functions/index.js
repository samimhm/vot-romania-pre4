import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { https } from 'firebase-functions';
import fetch from 'node-fetch';

// Initialize Firebase Admin
initializeApp();

export const validateRecaptcha = https.onCall(async (data, context) => {
  try {
    const token = data.token;
    // Use functions config instead of process.env
    const secretKey = '6Lcbi4oqAAAAAHs0OmzGUsd2gRmwgF-j0EKMvr84';

    if (!token) {
      throw new https.HttpsError(
        'invalid-argument',
        'Token-ul reCAPTCHA lipsește'
      );
    }

    const verificationURL = 'https://www.google.com/recaptcha/api/siteverify';
    const response = await fetch(verificationURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `secret=${secretKey}&response=${token}`
    });

    if (!response.ok) {
      throw new https.HttpsError(
        'internal',
        'Eroare la verificarea reCAPTCHA'
      );
    }

    const result = await response.json();
    console.log('reCAPTCHA verification result:', result);

    if (!result.success) {
      throw new https.HttpsError(
        'invalid-argument',
        'Verificarea reCAPTCHA a eșuat',
        result['error-codes']
      );
    }

    return {
      success: true,
      score: result.score || 0
    };
  } catch (error) {
    console.error('Error validating reCAPTCHA:', error);
    throw new https.HttpsError(
      'internal',
      'Verificarea reCAPTCHA a eșuat',
      error.message
    );
  }
});