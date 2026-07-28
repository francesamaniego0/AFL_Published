window.summernoteInterop = {

    initialize: function (id) {
        $('#' + id).summernote({
            height: 300
        });
    },

    getContent: function (id) {
        return $('#' + id).summernote('code');
    },

    setContent: function (id, html) {
        $('#' + id).summernote('code', html);
    },

    destroy: function (id) {
        $('#' + id).summernote('destroy');
    }
};