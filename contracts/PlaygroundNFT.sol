// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PlaygroundNFT is ERC721URIStorage, Ownable {
    uint256 public nextTokenId;

    constructor() ERC721("Playground NFT", "PLAY") Ownable(msg.sender) {}

    function mint(address to, string calldata uri) external onlyOwner returns (uint256 id) {
        id = nextTokenId++;
        _safeMint(to, id);
        _setTokenURI(id, uri);
    }
}
