import React from 'react';
import PropTypes from 'prop-types';
import './ItemCard.css';

import cloudIcon from '../../assets/cloud.svg';
import localIcon from '../../assets/local.svg';

const ItemCard = ({ item, isTagChecked = true, onPaste, onToggleSelect, onContextMenu }) => {
  return (
    <div
      className="item-card"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(item.itemId, e);
      }}
    >
      <div className="item-card-content">
        {/* 이미지 */}
        {item.type === 'image' && (
          <img
            src={item.thumbnail_path ?? item.src}
            alt={item.content ?? 'image'}
            className="item-image"
            onClick={() => onPaste(item.itemId)}
          />
        )}
        {/* 텍스트 */}
        {item.type === 'text' && item.content && (
          <p
            className="item-text"
            onClick={() => onPaste(item.itemId)}
          >
            {item.content}
          </p>
        )}

        {/* 체크박스 */}
        <div className="item-checkbox">
          <input
            type="checkbox"
            checked={!!item.selected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect(item.itemId);
            }}
          />
        </div>

        {/* 로컬/클라우드 아이콘 */}
        <div className="item-icon">
          {(item.shared === 'both' || item.shared === 'cloud') && (
            <img
              src={cloudIcon}
              alt="cloud"
            />
          )}
          {(item.shared === 'both' || item.shared === 'local') && (
            <img
              src={localIcon}
              alt="local"
            />
          )}
        </div>

        {/* 태그 */}
        {isTagChecked ? (
          <div className="item-tag">{item.tags && item.tags.length > 0 ? <span>{item.tags.map((t) => `#${typeof t === 'string' ? t : t.tag}`).join(' ')}</span> : <span># 태그 없음</span>}</div>
        ) : null}
      </div>
    </div>
  );
};

ItemCard.PropTypes = {
  item: PropTypes.object.isRequired,
  onPaste: PropTypes.func.isRequired,
  onToggleSelect: PropTypes.func.isRequired,
  onContextMenu: PropTypes.func.isRequired,
};

export default React.memo(ItemCard);
