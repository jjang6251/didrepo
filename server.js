const express = require('express');
const { EthrDID } = require('ethr-did');
const { createVerifiableCredentialJwt, createVerifiablePresentationJwt, verifyCredential, verifyPresentation } = require('did-jwt-vc');
const { Resolver } = require('did-resolver');
const { getResolver } = require('ethr-did-resolver');
const { JsonRpcProvider } = require('@ethersproject/providers');

// Express 서버 초기화
const app = express();
app.use(express.json());

// Sepolia 네트워크에 대한 이더리움 DID 설정 (Infura 사용)
const providerConfig = {
    networks: [{
        name: "sepolia",
        rpcUrl: "https://sepolia.infura.io/v3/bfaf1bc35b654d07b39bbb723e1f937d",
        registry: "0xdca7ef03e98e0dc2b855be647c39abe984fcf21b" // Sepolia의 DID 레지스트리 주소
    },
    {
        name: "mainnet",
        rpcUrl: "https://mainnet.infura.io/v3/bfaf1bc35b654d07b39bbb723e1f937d",
        registry: "0xdca7ef03e98e0dc2b855be647c39abe984fcf21b" // Sepolia의 DID 레지스트리 주소
    }
]
};

const resolver = new Resolver(getResolver(providerConfig));

// 발급자의 DID와 비밀 키 설정 (이슈어)
const issuer = new EthrDID({
    identifier: '0x42A905527d56146fF7b1895a6780980eC8B2D383', // Sepolia 네트워크의 DID
    provider: new JsonRpcProvider(providerConfig.networks[0].rpcUrl), // Sepolia 프로바이더 사용
    privateKey: 'e4d7baeb8df68a0962c69351ee64bdd21e43c94206aae5b66423c49d64353447'  // 발급자의 프라이빗 키
});

// VC 발급 API
app.post('/issue-vc', async (req, res) => {
    const { userDid } = req.body;

    // VC 발급을 위한 페이로드 생성
    const vcPayload = {
        sub: `did:ethr:${userDid}`,  // 사용자 DID를 Sepolia 네트워크 형식으로
        nbf: Math.floor(Date.now() / 1000),  // 발급일자
        vc: {
            '@context': ['https://www.w3.org/2018/credentials/v1'],
            type: ['VerifiableCredential'],
            credentialSubject: {
                degree: {
                    type: 'BachelorDegree',
                    name: 'Bachelor of Science in Computer Science'
                }
            }
        }
    };

    try {
        // VC JWT 생성
        const vcJwt = await createVerifiableCredentialJwt(vcPayload, issuer);
        res.json({ vcJwt });
    } catch (error) {
        console.error("VC 발급 오류:", error);
        res.status(500).json({ error: "VC 발급 오류" });
    }
});

// VP 발급 API
app.post('/issue-vp', async (req, res) => {
    const { vcJwt } = req.body;

    // VP 발급을 위한 페이로드 생성
    const vpPayload = {
        vp: {
            '@context': ['https://www.w3.org/2018/credentials/v1'],
            type: ['VerifiablePresentation'],
            verifiableCredential: [vcJwt]  // 기존에 발급된 VC
        }
    };

    try {
        // VP JWT 생성
        const vpJwt = await createVerifiablePresentationJwt(vpPayload, issuer);
        res.json({ vpJwt });
    } catch (error) {
        console.error("VP 발급 오류:", error);
        res.status(500).json({ error: "VP 발급 오류" });
    }
});

// VC 검증 API
app.post('/verify-vc', async (req, res) => {
    const { vcJwt } = req.body;

    try {
        // VC JWT 검증
        const verifiedVC = await verifyCredential(vcJwt, resolver);
        res.json({ verifiedVC });
    } catch (error) {
        console.error("VC 검증 오류:", error);
        res.status(500).json({ error: "VC 검증 오류" });
    }
});

// VP 검증 API
app.post('/verify-vp', async (req, res) => {
    const { vpJwt } = req.body;

    try {
        // VP JWT 검증
        const verifiedVP = await verifyPresentation(vpJwt, resolver);
        res.json({ verifiedVP });
    } catch (error) {
        console.error("VP 검증 오류:", error);
        res.status(500).json({ error: "VP 검증 오류" });
    }
});

// 서버 실행
const port = 3000;
app.listen(port, () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});

