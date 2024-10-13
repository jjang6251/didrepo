let web3;
let didInstance;

async function connectWallet() {
    if (window.ethereum) {
        web3 = new Web3(window.ethereum);
        await ethereum.request({ method: 'eth_requestAccounts' });
        alert('MetaMask connected');
    } else {
        alert('MetaMask not found. Please install it.');
    }
}

async function createJWT() {
    const did = document.getElementById('did').value;
    
    // 서버로 요청 보내서 JWT 생성
    const response = await fetch('/create-jwt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ did })
    });

    const data = await response.json();
    alert(`JWT: ${data.jwt}`);
}

async function verifyJWT() {
    const jwt = document.getElementById('jwt').value;

    // 서버로 요청 보내서 JWT 검증
    const response = await fetch('/verify-jwt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jwt })
    });

    const data = await response.json();
    document.getElementById('verificationResult').innerText = data.message;
}
