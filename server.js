const express = require('express');
const { EthrDID } = require('ethr-did');
const { createVerifiableCredentialJwt, createVerifiablePresentationJwt, verifyCredential, verifyPresentation } = require('did-jwt-vc');
const { Resolver } = require('did-resolver');
const { getResolver } = require('ethr-did-resolver');
const { JsonRpcProvider } = require('@ethersproject/providers');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require("cookie-parser");
const db = require('./models');
const { where } = require('sequelize');
const e = require('express');

dotenv.config();

// Express 서버 초기화
const app = express();
app.use(express.json());
app.use(cors());
app.use(cookieParser());
db.sequelize.sync();

const PORT = '3000';

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

async function verifyToken(req, res, next) {
    // 쿠키에서 토큰 추출
    const token = req.headers['authorization'];

    // console.log(token);

    if (!token) {
        return res.status(401).json('토큰이 없습니다!!');
    }

    try {
        // VC JWT 검증 - 비동기 처리
        const verifiedVC = await verifyCredential(token, resolver); // verifyCredential이 비동기 함수라고 가정

        // username 값 추출
        const userid = verifiedVC.payload.vc.credentialSubject.degree.userInfo.userid;
        const username = verifiedVC.payload.vc.credentialSubject.degree.userInfo.username;

        req.cookie_id = userid;
        req.cookie_name = username;

        next();
    } catch (error) {
        console.error("VC 검증 오류:", error);
        res.status(401).json({ error: "VC 검증 오류" });
    }
}

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
            userid: response_user.id,
            username: response_user.kakao_account.name,
            userphone: response_user.kakao_account.phone_number
        }

        const userid = response_user.id;
        const username = response_user.kakao_account.name;


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
            const user = await db.User.findOne({
                where: { kakaoid: userInfo.userid }
            });

            if (user) {
                try {
                    // VC JWT 생성
                    const vcJwt = await createVerifiableCredentialJwt(vcPayload, issuer);
                    res.json({ vcJwt });
                } catch (error) {
                    console.error("VC 발급 오류:", error);
                    res.status(500).json({ error: "VC 발급 오류" });
                }
            } else {
                try {
                    const newUser = await db.User.create({
                        kakaoid: userInfo.userid,
                        username: userInfo.username
                    });

                    try {
                        // VC JWT 생성
                        const vcJwt = await createVerifiableCredentialJwt(vcPayload, issuer);
                        res.json({ vcJwt });
                    } catch (error) {
                        console.error("VC 발급 오류:", error);
                        res.status(500).json({ error: "VC 발급 오류" });
                    }
                } catch (error) {
                    res.status(500).json({ error: "유저 생성 오류" });
                }
            }
        } catch (error) {
            console.error('Error finding user:', error);
        }




    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch data from external API' });
    }



    // VC 발급을 위한 페이로드 생성
});

// VC 검증 API
app.post('/verify-vc', async (req, res) => {
    const { vcJwt } = req.body;

    try {
        // VC JWT 검증
        const verifiedVC = await verifyCredential(vcJwt, resolver);

        // username 값 추출
        const username = verifiedVC.payload.vc.credentialSubject.degree.userInfo.username;
        // console.log(username);

        res.json({ username });
    } catch (error) {
        console.error("VC 검증 오류:", error);
        res.status(500).json({ error: "VC 검증 오류" });
    }
});

app.post('/iotregister', verifyToken, async (req, res) => {
    const userid = req.cookie_id;
    const { network, ip } = req.body;

    try {
        const newIot = await db.Iot.create({
            kakaoid: userid,
            network: network,
            ip: ip
        });

        res.status(201).json({ message: "iot created" });
    } catch (error) {
        res.status(500).json(error);
    }
});

app.post('/updateiot/:id', verifyToken, async (req, res) => {
    const userid = req.cookie_id;
    const updateData = req.body;
    const id = req.params.id;

    console.log(updateData);
    console.log(id);
    console.log(userid);

    try {
        const updateIot = await db.Iot.update(updateData, {
            where: { id: id, kakaoid: userid }
        });

        // updateIot[0]이 0보다 큰 경우, 업데이트 성공
        if (updateIot[0] > 0) {
            console.log('User details updated successfully');
            res.status(200).json({ message: "업데이트 완료" });
        } else {
            console.log('No record found with the specified id and kakaoid');
            res.status(404).json({ message: "업데이트할 레코드가 없습니다." });
        }
    } catch (error) {
        console.error("Update error:", error);
        res.status(500).json({ error: "업데이트 오류 발생" });
    }
});

app.get('/iotlist', verifyToken, async (req, res) => {
    const userid = req.cookie_id;

    try {
        const iotlist = await db.Iot.findAll({
            where: { kakaoid: userid }
        });
        const listCount = iotlist.length;


        return res.status(200).json({
            data: iotlist,
            listCount: listCount
        });
    } catch (error) {
        console.error('Error finding users:', error);
    }
});

app.get('/camera/:id', verifyToken, async (req, res) => {
    const userid = req.cookie_id;
    // const userid = '3750080222';
    const id = req.params.id;


    try {
        const findData = await db.Iot.findOne({
            where: {
                kakaoid: userid,
                id: id
            }
        });

        if (findData) {
            // res.status(200).json({ip: findData.ip});
            const targetUrl = `http://${findData.ip}`; // 절대 경로로 URL 설정
            console.log(`Redirecting to: ${targetUrl}`);
            res.cookie('access_token', 'iotping');

            const result = {
                address: targetUrl
            }
            return res.status(200).json(result);
        } else {
            res.status(404).json({ message: "Data not found" });
        }
    } catch (error) {
        console.error('Error finding data:', error);
        res.status(500).json({ message: "An error occurred" });
    }
});

app.post('/block', async (req, res) => {
    const ip = req.body.ip;

    try {
        const newBlock = await db.Access.create({
            ip: ip
        });

        if(newBlock) {
            return res.status(201).json({ message: "ip blocked" });
        } else {
            return res.status(404).json({ message: "fail to block" });
        }
        
    } catch (error) {
        res.status(500).json(error);
    }
});

app.get('/block', async(req, res) => {
    try {
        const findData = await db.Access.findAll();
        return res.status(200).json(findData);
    } catch (error) {
        res.status(500).json(error);
    }
});

app.delete('/block', async(req, res) => {
    const ipid = req.body.ipid;

    try {
        const deleteData = await db.Access.destroy({
            where: {
                id: ipid
            }
        });

        if(deleteData) {
            return res.status(200).json({message: "delete"});
        } else {
            return res.status(404).json({message: "fail(삭제하려는 ip 없음)"});
        }
    } catch (error) {
        res.status(500).json(error);
    }
})

app.listen(PORT, () => console.log(`${PORT}port connected`));