// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
// Found in the wild: no ERC-165, no safeTransferFrom; moves only via transferPunk. Emits the ERC-721
// Transfer event at mint so Alchemy indexes it (tokenType UNKNOWN / NO_SUPPORTED_NFT_STANDARD).
contract PunkLike {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event PunkTransfer(address indexed from, address indexed to, uint256 punkIndex);
    string public name = "PunkLike";
    string public symbol = "PUNKL";
    address public owner = msg.sender;
    uint256 public nextId;
    mapping(uint256 => address) public punkIndexToAddress;
    mapping(uint256 => string) private uris;
    function mint(address to, string calldata uri_) external returns (uint256 id) {
        require(msg.sender == owner, "owner");
        id = nextId++;
        punkIndexToAddress[id] = to;
        uris[id] = uri_;
        emit Transfer(address(0), to, id);
    }
    function ownerOf(uint256 id) external view returns (address) { return punkIndexToAddress[id]; }
    function tokenURI(uint256 id) external view returns (string memory) { return uris[id]; }
    function balanceOf(address a) external view returns (uint256 n) { for (uint256 i = 0; i < nextId; i++) if (punkIndexToAddress[i] == a) n++; }
    function transferPunk(address to, uint256 id) external {
        require(punkIndexToAddress[id] == msg.sender, "not yours");
        punkIndexToAddress[id] = to;
        emit Transfer(msg.sender, to, id);
        emit PunkTransfer(msg.sender, to, id);
    }
}
