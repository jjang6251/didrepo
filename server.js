const express = require('express');
const { EthrDID } = require('ethr-did');
const { createVerifiableCredentialJwt, createVerifiablePresentationJwt, verifyCredential, verifyPresentation } = require('did-jwt-vc');
const { Resolver } = require('did-resolver');
const { getResolver } = require('ethr-did-resolver');
const { JsonRpcProvider } = require('@ethersproject/providers');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

// Express 서버 초기화
const app = express();
app.use(express.json());
app.use(cors());

// Sepolia 네트워크에 대한 이더리움 DID 설정 (Infura 사용)
const providerConfig = {
    networks: [{
        name: "sepolia",
        rpcUrl: decodeURIComponent(process.env.SEPOLIA_RPCURL),
        registry: process.env.DIDREGISTRY
    },
    {
        name: "mainnet",
        rpcUrl: decodeURIComponent(process.env.MAINNET_RPCURL),
        registry: process.env.DIDREGISTRY
    }
    ]
};

const resolver = new Resolver(getResolver(providerConfig));

// 발급자의 DID와 비밀 키 설정 (이슈어)
const issuer = new EthrDID({
    identifier: process.env.ISSUER_DID,
    provider: new JsonRpcProvider(providerConfig.networks[0].rpcUrl), // Sepolia 프로바이더 사용
    privateKey: process.env.ISSUER_PRIVATE_KEY
});

// VC 발급 API
app.post('/issue-vc', async (req, res) => {
    const { userDid, userToken } = req.body;

    console.log(userToken);

    const kakao_url = "https://kapi.kakao.com/v2/user/me";

    const headers = {
        'Authorization': `Bearer ${userToken}`,  // 필요한 경우 토큰 추가
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
    };



    try {

        const response = await axios.get(kakao_url, { headers });
        const response_user = response.data;

        const userInfo = {
            username: response_user.kakao_account.name,
            userphone: response_user.kakao_account.phone_number
        }

        const vcPayload = {
            sub: `did:ethr:${userDid}`,  // 사용자 DID를 Sepolia 네트워크 형식으로
            nbf: Math.floor(Date.now() / 1000),  // 발급일자
            vc: {
                '@context': ['https://www.w3.org/2018/credentials/v1'],
                type: ['VerifiableCredential'],
                credentialSubject: {
                    degree: {
                        type: 'BachelorDegree',
                        name: 'Bachelor of Science in Computer Science',
                        userInfo
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


    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch data from external API' });
    }



    // VC 발급을 위한 페이로드 생성

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

