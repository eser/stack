package lib

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"time"
)

const (
	SelfSignedCertOrganization = "Development"
	SelfSignedCertValidity     = 365 * 24 * time.Hour
	SelfSignedKeyLength        = 2048
)

var (
	ErrPrivateKeyGeneration  = errors.New("failed to generate private key")
	ErrCertificateGeneration = errors.New("failed to generate certificate")
	ErrKeyPairCreation       = errors.New("failed to create key pair")
)

func CryptoGetRandomBytes(size int) ([]byte, error) {
	key := make([]byte, size)

	_, err := rand.Read(key)
	if err != nil {
		return nil, fmt.Errorf("failed to generate random bytes: %w", err)
	}

	return key, nil
}

func GenerateSelfSignedCert() (tls.Certificate, error) {
	// Generate private key
	priv, err := rsa.GenerateKey(rand.Reader, SelfSignedKeyLength)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("%w: %w", ErrPrivateKeyGeneration, err)
	}

	// Generate certificate template
	template := x509.Certificate{ //nolint:exhaustruct
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{ //nolint:exhaustruct
			Organization: []string{SelfSignedCertOrganization},
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(SelfSignedCertValidity),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	// Generate self-signed certificate
	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("%w: %w", ErrCertificateGeneration, err)
	}

	// Convert certificate and private key to PEM format
	certPEM := pem.EncodeToMemory(&pem.Block{ //nolint:exhaustruct
		Type:  "CERTIFICATE",
		Bytes: certDER,
	})
	keyPEM := pem.EncodeToMemory(&pem.Block{ //nolint:exhaustruct
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(priv),
	})

	// Create tls.Certificate
	keypair, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("%w: %w", ErrKeyPairCreation, err)
	}

	return keypair, nil
}
