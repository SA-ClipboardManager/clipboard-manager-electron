import React from 'react';
import PropTypes from 'prop-types';
import './ContextMenu.css';

const ContextMenu = ({ item, onDelete }) => {
  return (
    <div
      className="context-menu"
      onClick={(e) => e.stopPropagation()}
    >
      {(item.shared === 'both' || item.shared === 'all') && (
        <>
          <div
            className="context-menu-item"
            onClick={() => onDelete(item.itemId, 'both')}
          >
            모두 삭제
          </div>
          <hr />
        </>
      )}
      {(item.shared === 'local' || item.shared === 'both') && (
        <>
          <div
            className="context-menu-item"
            onClick={() => onDelete(item.itemId, 'local')}
          >
            Local에서 삭제
          </div>
          <hr />
        </>
      )}
      {(item.shared === 'cloud' || item.shared === 'both') && (
        <div
          className="context-menu-item"
          onClick={() => onDelete(item.itemId, 'cloud')}
        >
          Cloud에서 삭제
        </div>
      )}
    </div>
  );
};

ContextMenu.propTypes = {
  item: PropTypes.object.isRequired,
  onDelete: PropTypes.func.isRequired,
};

export default ContextMenu;
