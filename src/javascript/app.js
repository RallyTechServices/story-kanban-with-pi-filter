Ext.define("SKF", {
    extend: 'Rally.app.App',
    cls: 'kanban',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box',layout:{type:'hbox'}},
        {xtype:'container',itemId:'display_box'}
    ],
    settingsScope: 'project',
    autoScroll: false,
    
    mixins: [
        'Rally.Messageable'
    ],
    
    config: {
        defaultSettings: {
            groupByField: 'c_BusinessState',
            showRows: false,
            columns: Ext.JSON.encode({
                None: {wip: ''}
            }),
            cardFields: 'FormattedID,Name,Owner', //remove with COLUMN_LEVEL_FIELD_PICKER_ON_KANBAN_SETTINGS
            hideReleasedCards: false,
            showCardAge: true,
            cardAgeThreshold: 3,
            pageSize: 25
        }
    },
                        
    launch: function() {
        var me = this;
        Rally.data.ModelFactory.getModel({
            type: 'User Story',
            success: me._onModelRetrieved,
            scope: me
        });
        me.initiativeObjectID = 0;
        me.add(
            {
                xtype:'rallycombobox',
                fieldLabel: 'Initiative: ',
                labelWidth: 125,
                labelAlign: 'left',
                noEntryText: 'All',
                noEntryValue: 0,
                storeConfig: {
                    model: 'PortfolioItem/Initiative',
                    fetch: ['FormattedID','ObjectID','Name'],
                    remoteFilter: false,
                    autoLoad: true,
                    limit: Infinity,
                    listeners:{
                            load:function (store) {
                                store.add({ObjectID:0, FormattedID:'All',Name:''});  //adding empty record
                            }
                    }
                },
                listeners:{
                    select:function(cb){
                        me.initiativeObjectID = cb.value;
                        console.log('cb.value>>',cb.value);
                        me._addCardboardContent();
                    }
                },
                allowNoEntry: true,
                itemId: 'cb-portfolioitem',
                margin: 10,
                valueField: 'ObjectID',
                displayField: 'FormattedID',
                width: 600
                ,
                listConfig: {
                    itemTpl: '<tpl if="ObjectID &gt; -1">{FormattedID}: {Name}</tpl>'
                },
                filterProperties: ['Name','FormattedID','ObjectID'],
                fieldCls: 'pi-selector',
                displayTpl: '<tpl for=".">' +
                '<tpl if="ObjectID &gt; -1 ">' +
                '{[values["FormattedID"]]}: {[values["Name"]]}' +
                '</tpl>' +
                '<tpl if="xindex < xcount">,</tpl>' +
                '</tpl>'
            }
        );
        
    },

    _onModelRetrieved: function(model) {
        this.logger.log("_onModelRetrieved",model);
        this.groupByField = model.getField(this.getSetting('groupByField'));
        this._addCardboardContent();
    },

    _addCardboardContent: function() {
        this.logger.log('_addCardboardContent');
        
        if ( this.gridboard) { this.gridboard.destroy(); }
        
        var cardboardConfig = this._getCardboardConfig();

        var columnSetting = this._getColumnSetting();
        if (columnSetting) {
            cardboardConfig.columns = this._getColumnConfig(columnSetting);
        }

        var cardboard_config = this._getGridboardConfig(cardboardConfig);
        this.logger.log('config:', cardboard_config);

        this.gridboard = this.add(cardboard_config);
        //publish the gridboard
    },

    _getGridboardConfig: function(cardboardConfig) {
        var context = this.getContext(),
            modelNames = this._getDefaultTypes(),
            blacklist = ['Successors', 'Predecessors', 'DisplayColor'];

        return {
            xtype: 'rallygridboard',
            stateful: false,
            toggleState: 'board',
            cardBoardConfig: cardboardConfig,
            listeners: {
                            scope: this,
                            filterschanged: function(cb) {
                                console.log('cb >>>>>>>>>>>',cb);
                                this.filters = cb;
                                // this._publishFilter();

                            }
                        },
           plugins: [
               {
                   ptype: 'rallygridboardaddnew',
                   addNewControlConfig: {
                       listeners: {
                           beforecreate: this._onBeforeCreate,
                           beforeeditorshow: this._onBeforeEditorShow,
                           scope: this
                       },
                       stateful: true,
                       stateId: context.getScopedStateId('kanban-add-new')
                   }
               },
               {
                   ptype: 'rallygridboardcustomfiltercontrol',
                   filterChildren: true,
                   filterControlConfig: {
                       blackListFields: [],
                       //whiteListFields: ['Milestones'],
                       margin: '3 9 3 30',
                       modelNames: modelNames,
                       stateful: true,
                       stateId: context.getScopedStateId('kanban-custom-filter-button')
                      
                   },
                   showOwnerFilter: true,
                   ownerFilterControlConfig: {
                       stateful: true,
                       stateId: context.getScopedStateId('kanban-owner-filter')
                   }
               },
               {
                   ptype: 'rallygridboardfieldpicker',
                   headerPosition: 'left',
                   boardFieldBlackList: blacklist,
                   modelNames: modelNames,
                   boardFieldDefaults: this.getSetting('cardFields').split(',')
               },
               {
                   ptype: 'rallyboardpolicydisplayable',
                   prefKey: 'kanbanAgreementsChecked',
                   checkboxConfig: {
                       boxLabel: 'Show Agreements'
                   }
               }
           ],
            context: context,
            modelNames: modelNames,
            storeConfig: {
                filters: this._getFilters()
            },
            height: this.getHeight()
        };
    },

    _getColumnConfig: function(columnSetting) {
        this.logger.log('_getColumnConfig', columnSetting);
        var columns = [];
        Ext.Object.each(columnSetting, function(column, values) {
            var columnConfig = {
                xtype: 'kanbancolumn',
                enableWipLimit: true,
                wipLimit: values.wip,
                plugins: [{
                    ptype: 'rallycolumnpolicy',
                    app: this
                }],
                value: column,
                columnHeaderConfig: {
                    headerTpl: column || 'None'
                },
                listeners: {
                    invalidfilter: {
                        fn: this._onInvalidFilter,
                        scope: this
                    }
                }
            };
//            if(this._shouldShowColumnLevelFieldPicker()) {
//                columnConfig.fields = this._getFieldsForColumn(values);
//            }
            columns.push(columnConfig);
        }, this);

        columns[columns.length - 1].hideReleasedCards = this.getSetting('hideReleasedCards');

        return columns;
    },

    _getFieldsForColumn: function(values) {
        var columnFields = [];
//        if (this._shouldShowColumnLevelFieldPicker()) {
//            if (values.cardFields) {
//                columnFields = values.cardFields.split(',');
//            } else if (this.getSetting('cardFields')) {
//                columnFields = this.getSetting('cardFields').split(',');
//            }
//        }
        return columnFields;
    },

    _onInvalidFilter: function() {
        Rally.ui.notify.Notifier.showError({
            message: 'Invalid query: ' + this.getSetting('query')
        });
    },

    _getCardboardConfig: function() {
        var config = {
            xtype: 'rallycardboard',
            plugins: [
                //{ptype: 'rallycardboardprinting', pluginId: 'print'},
                {
                    ptype: 'rallyscrollablecardboard',
                    containerEl: this.getEl()
                },
                {ptype: 'rallyfixedheadercardboard'}
            ],
            types: this._getDefaultTypes(),
            attribute: this.getSetting('groupByField'),
            margin: '10px',
            context: this.getContext(),
            // listeners: {
            //    // beforecarddroppedsave: this._onBeforeCardSaved,
            //    // load: this._onBoardLoad,
            //    // cardupdated: this._publishContentUpdatedNoDashboardLayout,
            // },
            columnConfig: {
                xtype: 'rallycardboardcolumn',
                enableWipLimit: true
            },
            cardConfig: {
                editable: true,
                showIconMenus: true,
                showAge: this.getSetting('showCardAge') ? this.getSetting('cardAgeThreshold') : -1,
                showBlockedReason: true
            },
            storeConfig: {
                context: this.getContext().getDataContext()
            }
        };
        if (this.getSetting('showRows')) {
            Ext.merge(config, {
                rowConfig: {
                    field: this.getSetting('rowsField'),
                    sortDirection: 'ASC'
                }
            });
        }
        return config;
    },


    _getFilters: function() {
        var filters = [];
        var me = this;

        var andFilters;
        if(me.initiativeObjectID > 0){

            andFilters = Ext.create('Rally.data.wsapi.Filter',{
                property: 'Feature.Parent.Parent.ObjectID',
                value: me.initiativeObjectID
            });

        }else{

            andFilters = Ext.create('Rally.data.wsapi.Filter',{
                property: 'Feature.Parent.Parent.ObjectID',
                operator: '>',
                value: 0
            });
        
        }

        andFilters.and({
            property: 'Project',
            value: me.getContext().getProject()._ref
        });   

        if(this.getSetting('query')) {
            filters.push(Rally.data.QueryFilter.fromQueryString(this.getSetting('query')));
        }
        if(this.getContext().getTimeboxScope()) {
            filters.push(this.getContext().getTimeboxScope().getQueryFilter());
        }


        andFilters.and(filters);

        console.log('andFilters>>',andFilters);

        return andFilters;
    },

    _getColumnSetting: function() {
        var columnSetting = this.getSetting('columns');
        return columnSetting && Ext.JSON.decode(columnSetting);
    },

    _onBoardLoad: function() {
        this._publishContentUpdated();
        this.setLoading(false);
    },

    _onBeforeCreate: function(addNew, record, params) {
        Ext.apply(params, {
            rankTo: 'BOTTOM',
            rankScope: 'BACKLOG'
        });
        record.set(this.getSetting('groupByField'), this.gridboard.getGridOrBoard().getColumns()[0].getValue());
    },

    _onBeforeEditorShow: function(addNew, params) {
        params.rankTo = 'BOTTOM';
        params.rankScope = 'BACKLOG';
        params.iteration = 'u';

        var groupByFieldName = this.groupByField.name;

        params[groupByFieldName] = this.gridboard.getGridOrBoard().getColumns()[0].getValue();
    },

    _getDefaultTypes: function() {
        return ['User Story'];
//        return ['User Story', 'Defect'];
    },

    _onBeforeCardSaved: function(column, card, type) {
        var columnSetting = this._getColumnSetting();
        if (columnSetting) {
            var setting = columnSetting[column.getValue()];
//            
//            if (setting && setting.stateMapping && card.getRecord().get('_type') == 'defect') {
//                card.getRecord().set('State', setting.stateMapping);
//            }
        }
    },

    // _publishFilter: function() {
    //     this.publish('milestoneFilterChanged', this.filters);
    // },
    
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },

    getSettingsFields: function() {
        return Rally.apps.kanban.Settings.getFields({
            //shouldShowColumnLevelFieldPicker: this._shouldShowColumnLevelFieldPicker(),
            defaultCardFields: this.getSetting('cardFields')
        });
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        // Ext.apply(this, settings);
        this.launch();
    }
});
