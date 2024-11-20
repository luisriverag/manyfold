require "rails_helper"

#   scan_library POST   /libraries/:id/scan(.:format)                                           libraries#scan
# scan_libraries POST   /libraries/scan(.:format)                                               libraries#scan_all
#      libraries GET    /libraries(.:format)                                                    libraries#index
#                POST   /libraries(.:format)                                                    libraries#create
#    new_library GET    /libraries/new(.:format)                                                libraries#new
#   edit_library GET    /libraries/:id/edit(.:format)                                           libraries#edit
#        library GET    /libraries/:id(.:format)                                                libraries#show
#                PATCH  /libraries/:id(.:format)                                                libraries#update
#                PUT    /libraries/:id(.:format)                                                libraries#update
#                DELETE /libraries/:id(.:format)                                                libraries#destroy

RSpec.describe "Libraries" do
  context "when signed out" do
    it "needs testing when multiuser is enabled"
  end

  context "when signed in" do
    let!(:library) do
      create(:library) do |l|
        create_list(:model, 2, library: l)
      end
    end

    describe "POST /libraries/:id/scan" do
      it "scans a single library", :as_contributor do # rubocop:todo RSpec/MultipleExpectations
        expect { post "/libraries/#{library.to_param}/scan" }.to have_enqueued_job(Scan::DetectFilesystemChangesJob).exactly(:once)
        expect(response).to redirect_to("/libraries/#{library.public_id}")
      end

      it "denies member permission", :as_member do
        expect { post "/libraries/#{library.to_param}/scan" }.to raise_error(Pundit::NotAuthorizedError)
      end
    end

    describe "POST /libraries/scan" do
      it "scans all libraries", :as_contributor do # rubocop:todo RSpec/MultipleExpectations
        expect { post "/libraries/scan" }.to have_enqueued_job(Scan::DetectFilesystemChangesJob).exactly(:once)
        expect(response).to redirect_to("/models")
      end

      it "denies member permission", :as_member do
        expect { post "/libraries/scan" }.to raise_error(Pundit::NotAuthorizedError)
      end
    end

    describe "GET /settings/libraries" do
      it "denies permission", :as_member do
        expect { get "/settings/libraries" }.to raise_error(ActionController::RoutingError)
      end

      it "shows list", :as_administrator do
        get "/settings/libraries"
        expect(response).to have_http_status(:success)
      end
    end

    describe "POST /libraries/" do
      it "creates a new library", :as_administrator do
        post "/libraries", params: {library: {name: "new"}}
        expect(response).to have_http_status(:success)
      end

      it "is denied to non-admins", :as_moderator do
        expect { post "/libraries", params: {library: {name: "new"}} }.to raise_error(Pundit::NotAuthorizedError)
      end
    end

    describe "GET /libraries/new" do
      it "shows the new library form", :as_administrator do
        get "/libraries/new"
        expect(response).to have_http_status(:success)
      end

      it "is denied to non-admins", :as_moderator do
        expect { get "/libraries/new" }.to raise_error(Pundit::NotAuthorizedError)
      end
    end

    describe "GET /libraries/:id/edit" do
      it "shows the edit library form", :as_administrator do
        get "/libraries/#{library.to_param}/edit"
        expect(response).to have_http_status(:success)
      end

      it "is denied to non-administrators", :as_moderator do
        expect { get "/libraries/#{library.to_param}/edit" }.to raise_error(Pundit::NotAuthorizedError)
      end
    end

    describe "GET /libraries/:id" do
      it "redirects to models index with library filter", :as_member do
        get "/libraries/#{library.to_param}"
        expect(response).to redirect_to("/models?library=#{library.public_id}")
      end
    end

    describe "PATCH /libraries/:id" do
      it "updates the library", :as_administrator do
        patch "/libraries/#{library.to_param}", params: {library: {name: "new"}}
        expect(response).to redirect_to("/models")
      end

      it "is denied to non-administrators", :as_moderator do
        expect { patch "/libraries/#{library.to_param}", params: {library: {name: "new"}} }.to raise_error(Pundit::NotAuthorizedError)
      end
    end

    describe "DELETE /libraries/:id" do
      it "removes the library", :as_administrator do
        delete "/libraries/#{library.to_param}"
        expect(response).to redirect_to("/libraries")
      end

      it "is denied to non-administrators", :as_moderator do
        expect { delete "/libraries/#{library.to_param}" }.to raise_error(Pundit::NotAuthorizedError)
      end
    end
  end
end
