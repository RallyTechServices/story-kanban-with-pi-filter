Ext.override(Rally.ui.gridboard.GridBoard,{
    applyCustomFilter: function(filterObj) {
        var gridOrBoard = this.getGridOrBoard();

        this.currentCustomFilter = filterObj;

        if (gridOrBoard) {
            if (this.getToggleState() === 'board') {
                this._applyBoardFilters(gridOrBoard, filterObj);
            } else {
                this._applyGridFilters(gridOrBoard, filterObj);
            }
        }
        /**
         * Call your code here or fire an event from the gridboard.  
         * If you fire an event from ere, you can put a listener on the gridboard
         */
        this.fireEvent('filterschanged', filterObj.filters);
    } 
});