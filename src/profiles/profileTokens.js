import ecurve from 'ecurve'
import { ECPair } from 'bitcoinjs-lib'
import { decodeToken, SECP256K1Client, TokenSigner, TokenVerifier } from 'jsontokens'

import { nextYear, makeUUID4 } from '../utils'

const secp256k1 = ecurve.getCurveByName('secp256k1')

/**
  * Signs a profile token
  * @param {Object} profile - the JSON of the profile to be signed
  * @param {String} privateKey - the signing private key
  * @param {Object} subject - the entity that the information is about
  * @param {Object} issuer - the entity that is issuing the token
  * @param {String} signingAlgorithm - the signing algorithm to use
  * @param {Date} issuedAt - the time of issuance of the token
  * @param {Date} expiresAt - the time of expiration of the token
  */
export function signProfileToken(profile,
                          privateKey,
                          subject = null,
                          issuer = null,
                          signingAlgorithm = 'ES256K',
                          issuedAt = new Date(),
                          expiresAt = nextYear()) {
  if (signingAlgorithm !== 'ES256K') {
    throw new Error('Signing algorithm not supported')
  }

  const publicKey = SECP256K1Client.derivePublicKey(privateKey)

  if (subject === null) {
    subject = { publicKey }
  }

  if (issuer === null) {
    issuer = { publicKey }
  }

  const tokenSigner = new TokenSigner(signingAlgorithm, privateKey)

  const payload = {
    jti: makeUUID4(),
    iat: issuedAt.toISOString(),
    exp: expiresAt.toISOString(),
    subject,
    issuer,
    claim: profile
  }

  return tokenSigner.sign(payload)
}

/**
  * Wraps a token for a profile token file
  * @param {String} token - the token to be wrapped
  */
export function wrapProfileToken(token) {
  return {
    token,
    decodedToken: decodeToken(token)
  }
}

/**
  * Verifies a profile token
  * @param {String} token - the token to be verified
  * @param {String} publicKeyOrAddress - the public key or address of the
  *   keypair that is thought to have signed the token
  */
export function verifyProfileToken(token, publicKeyOrAddress) {
  const decodedToken = decodeToken(token)
  const payload = decodedToken.payload

  // Inspect and verify the subject
  if (payload.hasOwnProperty('subject')) {
    if (!payload.subject.hasOwnProperty('publicKey')) {
      throw new Error('Token doesn\'t have a subject public key')
    }
  } else {
    throw new Error('Token doesn\'t have a subject')
  }

  // Inspect and verify the issuer
  if (payload.hasOwnProperty('issuer')) {
    if (!payload.issuer.hasOwnProperty('publicKey')) {
      throw new Error('Token doesn\'t have an issuer public key')
    }
  } else {
    throw new Error('Token doesn\'t have an issuer')
  }

  // Inspect and verify the claim
  if (!payload.hasOwnProperty('claim')) {
    throw new Error('Token doesn\'t have a claim')
  }

  const issuerPublicKey = payload.issuer.publicKey
  const publicKeyBuffer = new Buffer(issuerPublicKey, 'hex')

  const Q = ecurve.Point.decodeFrom(secp256k1, publicKeyBuffer)
  const compressedKeyPair = new ECPair(null, Q, { compressed: true })
  const compressedAddress = compressedKeyPair.getAddress()
  const uncompressedKeyPair = new ECPair(null, Q, { compressed: false })
  const uncompressedAddress = uncompressedKeyPair.getAddress()

  if (publicKeyOrAddress === issuerPublicKey) {
    // pass
  } else if (publicKeyOrAddress === compressedAddress) {
    // pass
  } else if (publicKeyOrAddress === uncompressedAddress) {
    // pass
  } else {
    throw new Error('Token issuer public key does not match the verifying value')
  }

  const tokenVerifier = new TokenVerifier(decodedToken.header.alg, issuerPublicKey)
  if (!tokenVerifier) {
    throw new Error('Invalid token verifier')
  }

  const tokenVerified = tokenVerifier.verify(token)
  if (!tokenVerified) {
    throw new Error('Token verification failed')
  }

  return decodedToken
}

/**
  * Extracts a profile from an encoded token
  * @param {String} token - the token to be extracted
  * @param {String} publicKeyOrAddress - the public key or address of the
  *   keypair that is thought to have signed the token
  */
export function extractProfile(token, publicKeyOrAddress = null) {
  let decodedToken
  if (publicKeyOrAddress) {
    decodedToken = verifyProfileToken(token, publicKeyOrAddress)
  } else {
    decodedToken = decodedToken(token)
  }

  let profile = {}
  if (decodedToken.hasOwnProperty('payload')) {
    const payload = decodedToken.payload
    if (payload.hasOwnProperty('claim')) {
      profile = decodedToken.payload.claim
    }
  }

  return profile
}
