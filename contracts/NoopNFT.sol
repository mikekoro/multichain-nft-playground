// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
// Looks like an ERC-721 (ERC-165 says so, Transfer at mint so Alchemy lists it), but every transfer
// call succeeds and moves nothing: no event, ownerOf unchanged. A wallet judging by receipt.status says "sent".
contract NoopNFT {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    string public name = "NoopNFT";
    string public symbol = "NOOP";
    address public owner = msg.sender;
    uint256 public nextId;
    mapping(uint256 => address) private owners;
    mapping(uint256 => string) private uris;
    function supportsInterface(bytes4 id) external pure returns (bool) { return id == 0x80ac58cd || id == 0x01ffc9a7 || id == 0x5b5e139f; }
    function mint(address to, string calldata uri_) external returns (uint256 id) {
        require(msg.sender == owner, "owner");
        id = nextId++;
        owners[id] = to;
        uris[id] = uri_;
        emit Transfer(address(0), to, id);
    }
    function ownerOf(uint256 id) external view returns (address) { return owners[id]; }
    function tokenURI(uint256 id) external view returns (string memory) { return uris[id]; }
    function balanceOf(address a) external view returns (uint256 n) { for (uint256 i = 0; i < nextId; i++) if (owners[i] == a) n++; }
    function approve(address, uint256) external {}
    function setApprovalForAll(address, bool) external {}
    function getApproved(uint256) external pure returns (address) { return address(0); }
    function isApprovedForAll(address, address) external pure returns (bool) { return false; }
    function transferFrom(address, address, uint256) external {}
    function safeTransferFrom(address, address, uint256) external {}
    function safeTransferFrom(address, address, uint256, bytes calldata) external {}
}
